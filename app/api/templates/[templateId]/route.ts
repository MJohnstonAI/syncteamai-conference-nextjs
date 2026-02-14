import { NextResponse } from "next/server";
import { z } from "zod";
import { buildTemplateDataFromPrompt } from "@/lib/configuration/template-data";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const paramsSchema = z.object({
  templateId: z.string().uuid(),
});

type PromptRow = {
  id: string;
  title: string;
  description: string | null;
  script: string;
  created_at: string;
};

export async function GET(
  request: Request,
  context: { params: { templateId: string } }
) {
  try {
    const { supabase } = await requireRequestUser(request);
    const { templateId } = paramsSchema.parse(context.params);

    const { data, error } = await supabase
      .from("saved_prompts")
      .select("id, title, description, script, created_at")
      .eq("id", templateId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    const template = buildTemplateDataFromPrompt(data as PromptRow);
    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to load template." }, { status: 500 });
  }
}

