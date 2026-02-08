import { NextResponse } from "next/server";
import { z } from "zod";
import {
  claimIdempotencyKey,
  enforceRateLimit,
  resolveRequestIdentity,
} from "@/lib/server/rate-limit";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
  highlighted: z.boolean(),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
});

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const identity = resolveRequestIdentity(request, user.id);

    const userLimit = await enforceRateLimit({
      scope: "user",
      identifier: `${identity.userKey}:thread-highlight`,
      limit: 60,
      windowSec: 60,
    });
    if (!userLimit.allowed) {
      return tooManyRequests(
        "Highlight update rate limit reached. Try again shortly.",
        userLimit.retryAfterSec
      );
    }

    const ipLimit = await enforceRateLimit({
      scope: "ip",
      identifier: `${identity.ipKey}:thread-highlight`,
      limit: 120,
      windowSec: 60,
    });
    if (!ipLimit.allowed) {
      return tooManyRequests(
        "This IP is temporarily rate limited.",
        ipLimit.retryAfterSec
      );
    }

    const body = bodySchema.parse(await request.json());
    const idempotencyKey =
      request.headers.get("x-idempotency-key") ??
      body.idempotencyKey ??
      `${body.conversationId}:${body.messageId}:${body.highlighted}`;

    const isNew = await claimIdempotencyKey({
      userId: user.id,
      key: idempotencyKey,
      ttlSec: 120,
    });
    if (!isNew) {
      return NextResponse.json(
        {
          error: "Duplicate highlight request blocked.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 }
      );
    }

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
