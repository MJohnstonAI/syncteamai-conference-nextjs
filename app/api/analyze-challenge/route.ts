import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeChallengeWithAI } from "@/lib/ai/challenge-analyzer";
import type { ChallengeAnalysis, TemplateData } from "@/lib/configuration/types";
import { getEffectiveOpenRouterKey } from "@/lib/server/byok";
import {
  claimIdempotencyKey,
  enforceRateLimit,
  resolveRequestIdentity,
} from "@/lib/server/rate-limit";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const templateDataSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullable().optional(),
  script: z.string().max(120_000),
  problemStatement: z.string().min(1).max(6000),
  type: z.string().min(1).max(120),
  context: z.object({
    companySize: z.enum(["startup", "small", "mid-market", "enterprise", "unspecified"]),
    stakesLevel: z.enum(["low", "medium", "high", "critical", "unspecified"]),
    timeline: z.enum(["urgent", "near-term", "quarterly", "long-term", "unspecified"]),
    budget: z.enum(["lean", "balanced", "premium", "unspecified"]),
  }),
  createdAt: z.string().min(1),
});

const bodySchema = z.object({
  templateData: templateDataSchema,
  selectedMode: z.enum(["quick-start", "custom"]).optional(),
  forceRefresh: z.boolean().optional(),
});

type ExistingConfigurationRow = {
  analysis_payload: unknown;
  problem_type: string | null;
  complexity_score: number | null;
  recommended_strategy: string | null;
  strategy_reason: string | null;
  key_considerations: unknown;
  expert_panel: unknown;
  estimated_duration: number | null;
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toExistingConfigurationRow = (
  value: unknown
): ExistingConfigurationRow | null => {
  if (!isRecord(value)) return null;
  if (!("analysis_payload" in value) || !("expert_panel" in value)) {
    return null;
  }
  return value as ExistingConfigurationRow;
};

const toExistingAnalysis = (
  row: ExistingConfigurationRow
): ChallengeAnalysis | null => {
  if (isRecord(row.analysis_payload)) {
    return row.analysis_payload as ChallengeAnalysis;
  }

  if (!row.problem_type || !Array.isArray(row.expert_panel) || row.expert_panel.length === 0) {
    return null;
  }

  return {
    problemType: row.problem_type,
    complexityScore: row.complexity_score ?? 5,
    complexityReason: "Loaded from saved configuration.",
    recommendedStrategy: row.recommended_strategy ?? "balanced_roundtable",
    strategyReason: row.strategy_reason ?? "Loaded from saved configuration.",
    keyConsiderations: Array.isArray(row.key_considerations) ? row.key_considerations : [],
    expertPanel: row.expert_panel,
    estimatedDuration: row.estimated_duration ?? 45,
    estimatedCost: {
      min: row.estimated_cost_min ?? 0,
      max: row.estimated_cost_max ?? 0,
    },
    analysisSource: "ai",
  };
};

const tooManyRequests = (message: string, retryAfterSec: number) =>
  NextResponse.json(
    {
      error: message,
      code: "RATE_LIMITED",
      retryAfterSec,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfterSec)),
      },
    }
  );

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireRequestUser(request);
    const body = bodySchema.parse(await request.json());
    const forceRefresh = body.forceRefresh === true;

    const { data: templateRecord, error: templateError } = await supabase
      .from("saved_prompts")
      .select("id, user_id, is_demo")
      .eq("id", body.templateData.id)
      .maybeSingle();

    if (templateError) {
      throw new Error(templateError.message);
    }

    if (!templateRecord) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    const { data: userRoleRecord, error: userRoleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (userRoleError) {
      throw new Error(userRoleError.message);
    }

    const isAdmin = userRoleRecord?.role === "admin";
    const isTemplateOwner = templateRecord.user_id === user.id;

    if (templateRecord.is_demo && !(isAdmin && isTemplateOwner)) {
      return NextResponse.json(
        { error: "Only the demo owner admin can regenerate demo configurations." },
        { status: 403 }
      );
    }

    if (!templateRecord.is_demo && !isTemplateOwner) {
      return NextResponse.json(
        { error: "You can only configure your own templates." },
        { status: 403 }
      );
    }

    const { data: existingConfiguration, error: existingConfigurationError } = await supabase
      .from("conference_configurations")
      .select(
        [
          "analysis_payload",
          "problem_type",
          "complexity_score",
          "recommended_strategy",
          "strategy_reason",
          "key_considerations",
          "expert_panel",
          "estimated_duration",
          "estimated_cost_min",
          "estimated_cost_max",
        ].join(", ")
      )
      .eq("template_id", body.templateData.id)
      .maybeSingle();

    if (existingConfigurationError) {
      throw new Error(existingConfigurationError.message);
    }

    if (existingConfiguration && !forceRefresh) {
      const existingRow = toExistingConfigurationRow(existingConfiguration);
      const existingAnalysis = existingRow
        ? toExistingAnalysis(existingRow)
        : null;
      if (existingAnalysis) {
        return NextResponse.json({ analysis: existingAnalysis, reused: true });
      }

      return NextResponse.json(
        {
          error: "Configuration already exists for this template.",
          code: "CONFIG_EXISTS",
        },
        { status: 409 }
      );
    }

    const idempotencyAccepted = await claimIdempotencyKey({
      userId: user.id,
      key: `config-seed:${body.templateData.id}:${forceRefresh ? "refresh" : "seed"}`,
      ttlSec: 45,
    });

    if (!idempotencyAccepted) {
      return NextResponse.json(
        {
          error: "Duplicate configuration seed request blocked.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 }
      );
    }

    if (process.env.ENABLE_AI_RATE_LIMITING === "true") {
      const identity = resolveRequestIdentity(request, user.id);

      const userLimit = await enforceRateLimit({
        scope: "user",
        identifier: `${identity.userKey}:config-seed`,
        limit: 2,
        windowSec: 60,
      });
      if (!userLimit.allowed) {
        return tooManyRequests(
          "Rate limit reached for configuration seeding.",
          userLimit.retryAfterSec
        );
      }

      const ipLimit = await enforceRateLimit({
        scope: "ip",
        identifier: `${identity.ipKey}:config-seed`,
        limit: 8,
        windowSec: 60,
      });
      if (!ipLimit.allowed) {
        return tooManyRequests(
          "This IP is temporarily rate limited for configuration seeding.",
          ipLimit.retryAfterSec
        );
      }
    }

    const parsedTemplate = body.templateData as TemplateData;
    const templateData: TemplateData = {
      ...parsedTemplate,
      description: parsedTemplate.description ?? null,
    };

    const serviceApiKey = process.env.OPENROUTER_API_KEY?.trim() || null;
    const byokApiKey = serviceApiKey
      ? null
      : await getEffectiveOpenRouterKey({
          supabase,
          userId: user.id,
        });
    const apiKey = serviceApiKey || byokApiKey;

    const analysis = await analyzeChallengeWithAI({
      templateData,
      apiKey,
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request payload." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to analyze challenge." },
      { status: 500 }
    );
  }
}
