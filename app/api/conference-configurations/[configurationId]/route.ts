import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  configurationId: z.string().uuid(),
});

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

    return NextResponse.json({ configuration: data });
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

