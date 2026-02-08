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
  roundId: z.string().uuid().nullable().optional(),
  parentMessageId: z.string().uuid().nullable().optional(),
  content: z.string().trim().min(1).max(120_000),
  replyMode: z.enum(["human", "agent"]).default("human"),
  avatarId: z.string().trim().max(64).optional(),
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
      identifier: `${identity.userKey}:thread-reply`,
      limit: 40,
      windowSec: 60,
    });
    if (!userLimit.allowed) {
      return tooManyRequests(
        "Reply rate limit reached. Try again shortly.",
        userLimit.retryAfterSec
      );
    }

    const ipLimit = await enforceRateLimit({
      scope: "ip",
      identifier: `${identity.ipKey}:thread-reply`,
      limit: 100,
      windowSec: 60,
    });
    if (!ipLimit.allowed) {
      return tooManyRequests(
        "This IP is temporarily rate limited.",
        ipLimit.retryAfterSec
      );
    }

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

    let parentMessage:
      | {
          id: string;
          role: "user" | "assistant" | "system";
          round_id: string | null;
          conversation_id: string;
        }
      | null = null;

    if (body.parentMessageId) {
      const { data: parentData, error: parentError } = await supabase
        .from("messages")
        .select("id, role, round_id, conversation_id")
        .eq("id", body.parentMessageId)
        .eq("conversation_id", body.conversationId)
        .maybeSingle();

      if (parentError) {
        throw new Error(parentError.message);
      }
      if (!parentData) {
        return NextResponse.json({ error: "Parent message not found." }, { status: 404 });
      }
      parentMessage = parentData;
    }

    const idempotencyKey =
      request.headers.get("x-idempotency-key") ??
      body.idempotencyKey ??
      `${body.conversationId}:${body.parentMessageId ?? "root"}:${body.replyMode}:${body.content.length}`;

    const isNew = await claimIdempotencyKey({
      userId: user.id,
      key: idempotencyKey,
      ttlSec: 120,
    });
    if (!isNew) {
      return NextResponse.json(
        { error: "Duplicate reply blocked.", code: "DUPLICATE_REQUEST" },
        { status: 409 }
      );
    }

    const role = body.replyMode === "agent" ? "assistant" : "user";
    if (role === "assistant" && !body.avatarId) {
      return NextResponse.json(
        { error: "avatarId is required for agent replies." },
        { status: 400 }
      );
    }

    const resolvedRoundId =
      body.roundId ??
      parentMessage?.round_id ??
      (parentMessage?.role === "user" ? parentMessage.id : null);

    const { data: inserted, error: insertError } = await supabase
      .from("messages")
      .insert({
        conversation_id: body.conversationId,
        parent_message_id: body.parentMessageId ?? null,
        round_id: resolvedRoundId,
        role,
        avatar_id: role === "assistant" ? body.avatarId ?? null : null,
        content: body.content,
      })
      .select(
        "id, conversation_id, parent_message_id, thread_root_id, round_id, depth, role, content, avatar_id, created_at, score, is_highlight"
      )
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    return NextResponse.json({
      message: {
        id: inserted.id,
        conversationId: inserted.conversation_id,
        parentMessageId: inserted.parent_message_id,
        threadRootId: inserted.thread_root_id,
        roundId: inserted.round_id,
        depth: inserted.depth ?? 0,
        role: inserted.role,
        content: inserted.content,
        avatarId: inserted.avatar_id,
        createdAt: inserted.created_at,
        score: inserted.score ?? 0,
        isHighlight: Boolean(inserted.is_highlight),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create reply." }, { status: 500 });
  }
}
