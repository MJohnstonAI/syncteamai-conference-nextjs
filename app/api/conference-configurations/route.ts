import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTemplateDataFromPrompt } from "@/lib/configuration/template-data";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const behaviorSchema = z.object({
  archetype: z.enum(["analytical", "strategic", "adversarial", "integrative", "creative"]),
  temperature: z.number().min(0).max(1),
  responseLength: z.enum(["concise", "medium", "comprehensive"]),
  interactionStyle: z.array(z.string()).max(8),
});

const roleSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(160),
  category: z.string().min(1).max(160),
  icon: z.string().min(1).max(100),
  description: z.string().min(1).max(1200),
  focusAreas: z.array(z.string()).max(10),
  behavior: behaviorSchema,
  model: z.object({
    provider: z.string().min(1).max(80),
    modelId: z.string().min(1).max(180),
    displayName: z.string().min(1).max(180),
  }),
  whyIncluded: z.string().min(1).max(2000),
  priority: z.enum(["critical", "recommended", "optional"]),
});

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

const aiAnalysisSchema = z.object({
  problemType: z.string().max(120),
  complexityScore: z.number().min(1).max(10),
  complexityReason: z.string().max(2000),
  recommendedStrategy: z.string().max(120),
  strategyReason: z.string().max(2000),
  keyConsiderations: z.array(z.string()).max(20),
  expertPanel: z.array(roleSchema).max(12),
  estimatedDuration: z.number().min(1).max(400),
  estimatedCost: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
  }),
  analysisSource: z.enum(["ai", "heuristic"]).optional(),
});

const bodySchema = z.object({
  templateId: z.string().uuid(),
  selectedMode: z.enum(["quick-start", "custom"]).optional(),
  templateData: templateDataSchema.optional(),
  expertPanel: z.array(roleSchema).optional(),
  aiAnalysis: aiAnalysisSchema.optional(),
  isDraft: z.boolean().optional(),
});

const querySchema = z.object({
  templateId: z.string().uuid(),
});

type TemplateRow = {
  id: string;
  user_id: string | null;
  is_demo: boolean;
  title: string;
  description: string | null;
  script: string;
  created_at: string;
};

type ConfigurationRow = {
  id: string;
  template_id: string;
  user_id: string;
  selected_mode: "quick-start" | "custom";
  is_draft: boolean;
  template_title: string | null;
  template_script: string | null;
  problem_statement: string | null;
  problem_type: string | null;
  complexity_score: number | null;
  recommended_strategy: string | null;
  strategy_reason: string | null;
  key_considerations: unknown;
  expert_panel: unknown;
  analysis_payload: unknown;
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
  estimated_duration: number | null;
  created_at: string;
  updated_at: string;
};

const toConfigurationRow = (value: unknown): ConfigurationRow | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (!("id" in value) || !("template_id" in value)) {
    return null;
  }

  return value as ConfigurationRow;
};

const getUserRole = async (supabase: Awaited<ReturnType<typeof requireRequestUser>>["supabase"], userId: string) => {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.role ?? "pending";
};

const getTemplateRow = async (
  supabase: Awaited<ReturnType<typeof requireRequestUser>>["supabase"],
  templateId: string
): Promise<TemplateRow | null> => {
  const { data, error } = await supabase
    .from("saved_prompts")
    .select("id, user_id, is_demo, title, description, script, created_at")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TemplateRow | null) ?? null;
};

const canEditTemplateConfiguration = ({
  template,
  currentUserId,
  isAdmin,
}: {
  template: TemplateRow;
  currentUserId: string;
  isAdmin: boolean;
}) => {
  if (template.is_demo) {
    return isAdmin || template.user_id === currentUserId;
  }
  return template.user_id === currentUserId;
};

const pickConfigurationColumns = () =>
  [
    "id",
    "template_id",
    "user_id",
    "selected_mode",
    "is_draft",
    "template_title",
    "template_script",
    "problem_statement",
    "problem_type",
    "complexity_score",
    "recommended_strategy",
    "strategy_reason",
    "key_considerations",
    "expert_panel",
    "analysis_payload",
    "estimated_cost_min",
    "estimated_cost_max",
    "estimated_duration",
    "created_at",
    "updated_at",
  ].join(", ");

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireRequestUser(request);
    const url = new URL(request.url);
    const query = querySchema.parse({
      templateId: url.searchParams.get("templateId"),
    });

    const template = await getTemplateRow(supabase, query.templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    const role = await getUserRole(supabase, user.id);
    const canEdit = canEditTemplateConfiguration({
      template,
      currentUserId: user.id,
      isAdmin: role === "admin",
    });

    const { data: configuration, error: configurationError } = await supabase
      .from("conference_configurations")
      .select(pickConfigurationColumns())
      .eq("template_id", query.templateId)
      .maybeSingle();

    if (configurationError) {
      throw new Error(configurationError.message);
    }

    const normalizedConfiguration = toConfigurationRow(configuration);

    return NextResponse.json({
      template: buildTemplateDataFromPrompt(template),
      templateMeta: {
        isDemo: template.is_demo,
        ownerUserId: template.user_id,
        canEdit,
      },
      configuration: normalizedConfiguration,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid query payload." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to load configuration." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireRequestUser(request);
    const body = bodySchema.parse(await request.json());

    const template = await getTemplateRow(supabase, body.templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    if (!template.is_demo && !template.user_id) {
      return NextResponse.json(
        { error: "Template owner is not assigned." },
        { status: 422 }
      );
    }

    const role = await getUserRole(supabase, user.id);
    const canEdit = canEditTemplateConfiguration({
      template,
      currentUserId: user.id,
      isAdmin: role === "admin",
    });

    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have permission to modify this configuration." },
        { status: 403 }
      );
    }

    const { data: existingConfiguration, error: existingError } = await supabase
      .from("conference_configurations")
      .select(pickConfigurationColumns())
      .eq("template_id", body.templateId)
      .maybeSingle();
    if (existingError) {
      throw new Error(existingError.message);
    }

    const current = toConfigurationRow(existingConfiguration);
    const normalizedPanel =
      body.expertPanel ??
      body.aiAnalysis?.expertPanel ??
      (Array.isArray(current?.expert_panel) ? current.expert_panel : []);

    const selectedMode =
      body.selectedMode ??
      (current?.selected_mode as "quick-start" | "custom" | undefined) ??
      "quick-start";

    const isDraft = body.isDraft ?? current?.is_draft ?? false;

    const templateTitle = body.templateData?.title ?? current?.template_title ?? template.title;
    const templateScript = body.templateData?.script ?? current?.template_script ?? template.script;
    const problemStatement =
      body.templateData?.problemStatement ??
      current?.problem_statement ??
      template.title;

    const configurationOwnerId = template.is_demo ? user.id : template.user_id!;

    const { data, error } = await supabase
      .from("conference_configurations")
      .upsert(
        {
          template_id: body.templateId,
          user_id: configurationOwnerId,
          selected_mode: selectedMode,
          is_draft: isDraft,
          template_title: templateTitle,
          template_script: templateScript,
          problem_statement: problemStatement,
          problem_type: body.aiAnalysis?.problemType ?? current?.problem_type ?? body.templateData?.type ?? null,
          complexity_score: body.aiAnalysis?.complexityScore ?? current?.complexity_score ?? null,
          recommended_strategy:
            body.aiAnalysis?.recommendedStrategy ?? current?.recommended_strategy ?? null,
          strategy_reason: body.aiAnalysis?.strategyReason ?? current?.strategy_reason ?? null,
          key_considerations:
            body.aiAnalysis?.keyConsiderations ?? current?.key_considerations ?? null,
          expert_panel: normalizedPanel,
          analysis_payload: body.aiAnalysis ?? current?.analysis_payload ?? null,
          estimated_cost_min:
            body.aiAnalysis?.estimatedCost.min ?? current?.estimated_cost_min ?? null,
          estimated_cost_max:
            body.aiAnalysis?.estimatedCost.max ?? current?.estimated_cost_max ?? null,
          estimated_duration:
            body.aiAnalysis?.estimatedDuration ?? current?.estimated_duration ?? null,
        },
        {
          onConflict: "template_id",
        }
      )
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ configurationId: data.id });
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
      { error: "Failed to save configuration." },
      { status: 500 }
    );
  }
}
