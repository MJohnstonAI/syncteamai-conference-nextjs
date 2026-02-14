import { NextResponse } from "next/server";
import { z } from "zod";
import { applyTemplateRoleOverridesToPanel } from "@/lib/ai/challenge-analyzer";
import { buildTemplateDataFromPrompt } from "@/lib/configuration/template-data";
import type { ChallengeAnalysis, ExpertRole, TemplateData } from "@/lib/configuration/types";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  configurationId: z.string().uuid(),
});

const asExpertPanel = (value: unknown): ExpertRole[] =>
  Array.isArray(value) ? (value as ExpertRole[]) : [];

const toTemplateDataFromConfiguration = (
  configuration: Record<string, unknown>
): TemplateData => ({
  id:
    typeof configuration.template_id === "string" && configuration.template_id.length > 0
      ? configuration.template_id
      : crypto.randomUUID(),
  title:
    typeof configuration.template_title === "string" && configuration.template_title.length > 0
      ? configuration.template_title
      : typeof configuration.problem_statement === "string" &&
          configuration.problem_statement.length > 0
        ? configuration.problem_statement
        : "Untitled template",
  description: null,
  script:
    typeof configuration.template_script === "string"
      ? configuration.template_script
      : "",
  problemStatement:
    typeof configuration.problem_statement === "string" &&
    configuration.problem_statement.length > 0
      ? configuration.problem_statement
      : typeof configuration.template_title === "string" &&
          configuration.template_title.length > 0
        ? configuration.template_title
        : "Untitled template",
  type:
    typeof configuration.problem_type === "string" && configuration.problem_type.length > 0
      ? configuration.problem_type
      : "general",
  context: {
    companySize: "unspecified",
    stakesLevel: "unspecified",
    timeline: "unspecified",
    budget: "unspecified",
  },
  createdAt:
    typeof configuration.created_at === "string" && configuration.created_at.length > 0
      ? configuration.created_at
      : new Date().toISOString(),
});

const resolveTemplateDataForOverrides = async ({
  supabase,
  record,
}: {
  supabase: Awaited<ReturnType<typeof requireRequestUser>>["supabase"];
  record: Record<string, unknown>;
}): Promise<TemplateData> => {
  const fallback = toTemplateDataFromConfiguration(record);
  const templateId =
    typeof record.template_id === "string" && record.template_id.length > 0
      ? record.template_id
      : null;

  if (!templateId) {
    return fallback;
  }

  const { data: templateRow, error: templateError } = await supabase
    .from("saved_prompts")
    .select("id, title, description, script, created_at")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError || !templateRow) {
    return fallback;
  }

  return buildTemplateDataFromPrompt(templateRow);
};

const applyOverridesToAnalysisPayload = (
  value: unknown,
  templateData: TemplateData
): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const analysis = value as Partial<ChallengeAnalysis> & Record<string, unknown>;
  const expertPanel = asExpertPanel(analysis.expertPanel);
  if (expertPanel.length === 0) {
    return value;
  }

  return {
    ...analysis,
    expertPanel: applyTemplateRoleOverridesToPanel({
      templateData,
      panel: expertPanel,
      maxRoles: 12,
    }),
  };
};

export async function GET(
  request: Request,
  context: { params: { configurationId: string } }
) {
  try {
    const { supabase } = await requireRequestUser(request);
    const { configurationId } = paramsSchema.parse(context.params);

    const { data, error } = await supabase
      .from("conference_configurations")
      .select(
        [
          "id",
          "template_id",
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
        ].join(", ")
      )
      .eq("id", configurationId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        { error: "Configuration not found." },
        { status: 404 }
      );
    }

    const record = data as unknown as Record<string, unknown>;
    const templateData = await resolveTemplateDataForOverrides({
      supabase,
      record,
    });
    const normalizedPanel = applyTemplateRoleOverridesToPanel({
      templateData,
      panel: asExpertPanel(record.expert_panel),
      maxRoles: 12,
    });

    return NextResponse.json({
      configuration: {
        ...record,
        expert_panel: normalizedPanel,
        analysis_payload: applyOverridesToAnalysisPayload(record.analysis_payload, templateData),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid configuration id." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to load configuration." },
      { status: 500 }
    );
  }
}
