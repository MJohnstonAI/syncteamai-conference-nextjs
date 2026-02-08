import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  highlighted: z.boolean(),
});

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function POST(request: Request) {
  try {
    const { supabase } = await requireRequestUser(request);
    const body = bodySchema.parse(await request.json());

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", body.conversationId)
      .maybeSingle();

    if (conversationError) {
      throw new Error(conversationError.message);
    }
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("messages")
      .update({ is_highlight: body.highlighted })
      .eq("id", body.messageId)
      .eq("conversation_id", body.conversationId)
      .select("id, is_highlight")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      messageId: data.id,
      highlighted: Boolean(data.is_highlight),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update highlight." }, { status: 500 });
  }
}
