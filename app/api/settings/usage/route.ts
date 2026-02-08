import { NextResponse } from "next/server";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireRequestUser(request);
    const { data, error } = await supabase
      .from("turn_usage_events")
      .select(
        "id, provider, model_id, status, status_code, total_tokens, cost_cents, latency_ms, created_at, conversation_id"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return NextResponse.json(
      { error: "Failed to load usage events." },
      { status: 500 }
    );
  }
}
