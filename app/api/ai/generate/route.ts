import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/lib/server/supabase-server";
import { getEffectiveOpenRouterKey } from "@/lib/server/byok";
import { canGenerate, getEntitlementTier } from "@/lib/server/entitlements";
import {
  acquireUserConcurrencySlot,
  claimIdempotencyKey,
  enforceRateLimit,
  getCircuitCooldownSec,
  openCircuitFor,
  resolveRequestIdentity,
} from "@/lib/server/rate-limit";
import { callOpenRouter, type OpenRouterResult } from "@/lib/server/openrouter";
import { writeUsageEvent } from "@/lib/server/usage-metering";

export const runtime = "nodejs";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1).max(120_000),
});

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  roundId: z.string().max(128).optional(),
  selectedAvatar: z.string().trim().max(64).optional(),
  modelId: z.string().trim().min(3).max(120),
  messages: z.array(messageSchema).min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
});

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const tooManyRequests = (message: string, retryAfterSec: number) =>
  NextResponse.json(
    {
      error: message,
      retryAfterSec,
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfterSec)),
      },
    }
  );

export async function POST(request: Request) {
  let usageLogged = false;
  let resolvedUserId = "";
  let resolvedConversationId: string | null = null;
  let resolvedRoundId: string | null = null;
  let resolvedModelId = "";
  let requestId: string | null = null;
  const startedAt = Date.now();
  let slot: Awaited<ReturnType<typeof acquireUserConcurrencySlot>> | null = null;

  try {
    const { user, supabase } = await requireRequestUser(request);
    resolvedUserId = user.id;

    const body = bodySchema.parse(await request.json());
    resolvedConversationId = body.conversationId;
    resolvedRoundId = body.roundId ?? null;
    resolvedModelId = body.modelId;

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", body.conversationId)
      .maybeSingle();

    if (conversationError) {
      throw new Error(conversationError.message);
    }
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 }
      );
    }

    const entitlement = await getEntitlementTier(supabase, user.id);
    if (!canGenerate(entitlement)) {
      return NextResponse.json(
        {
          error: "Access required. Contact support to enable AI generation.",
          code: "ENTITLEMENT_REQUIRED",
        },
        { status: 403 }
      );
    }

    const identity = resolveRequestIdentity(request, user.id);

    const userLimit = await enforceRateLimit({
      scope: "user",
      identifier: identity.userKey,
      limit: 10,
      windowSec: 60,
    });
    if (!userLimit.allowed) {
      return tooManyRequests(
        "Rate limited. Try again in a few seconds.",
        userLimit.retryAfterSec
      );
    }

    const ipLimit = await enforceRateLimit({
      scope: "ip",
      identifier: identity.ipKey,
      limit: 30,
      windowSec: 60,
    });
    if (!ipLimit.allowed) {
      return tooManyRequests(
        "This IP is temporarily rate limited.",
        ipLimit.retryAfterSec
      );
    }

    const cooldown = await getCircuitCooldownSec("openrouter");
    if (cooldown > 0) {
      return NextResponse.json(
        {
          error: "OpenRouter is busy. Please retry shortly.",
          code: "UPSTREAM_COOLDOWN",
          retryAfterSec: cooldown,
        },
        {
          status: 503,
          headers: {
            "Retry-After": String(cooldown),
          },
        }
      );
    }

    requestId =
      request.headers.get("x-idempotency-key") ??
      body.idempotencyKey ??
      `${body.conversationId}:${body.modelId}:${body.selectedAvatar ?? "default"}:${body.messages.length}`;

    const isNewRequest = await claimIdempotencyKey({
      userId: user.id,
      key: requestId,
      ttlSec: 120,
    });
    if (!isNewRequest) {
      return NextResponse.json(
        {
          error: "Duplicate generation request blocked.",
          code: "DUPLICATE_REQUEST",
        },
        { status: 409 }
      );
    }

    slot = await acquireUserConcurrencySlot({
      userId: user.id,
      maxConcurrent: 2,
      ttlSec: 300,
    });
    if (!slot.acquired) {
      return NextResponse.json(
        {
          error: "Too many concurrent generations. Please wait for current requests to finish.",
          code: "CONCURRENCY_LIMIT",
        },
        { status: 429 }
      );
    }

    const openRouterKey = await getEffectiveOpenRouterKey({
      supabase,
      userId: user.id,
    });

    if (!openRouterKey) {
      return NextResponse.json(
        {
          error: "OpenRouter key required. Add one on the Sign-in page.",
          code: "BYOK_REQUIRED",
        },
        { status: 400 }
      );
    }

    const openRouterResult = await callOpenRouter({
      apiKey: openRouterKey,
      modelId: body.modelId,
      messages: body.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      timeoutMs: 25_000,
      maxRetries: 2,
    });

    if (!openRouterResult.ok) {
      const failedResult = openRouterResult as Extract<OpenRouterResult, { ok: false }>;
      if (
        failedResult.errorCode === "UPSTREAM_UNAVAILABLE" ||
        failedResult.errorCode === "TIMEOUT"
      ) {
        await openCircuitFor({ provider: "openrouter", ttlSec: 20 });
      }

      await writeUsageEvent({
        userId: user.id,
        conversationId: body.conversationId,
        roundId: body.roundId ?? null,
        modelId: body.modelId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: failedResult.latencyMs,
        status: "error",
        statusCode: failedResult.statusCode,
        requestId,
      });
      usageLogged = true;

      return NextResponse.json(
        {
          error: failedResult.message,
          code: failedResult.errorCode,
          retryAfterSec: failedResult.retryAfterSec,
        },
        {
          status: failedResult.statusCode >= 400 ? failedResult.statusCode : 502,
          headers: failedResult.retryAfterSec
            ? { "Retry-After": String(failedResult.retryAfterSec) }
            : undefined,
        }
      );
    }

    const successResult = openRouterResult as Extract<OpenRouterResult, { ok: true }>;
    const promptTokens = Number(successResult.usage.prompt_tokens ?? 0);
    const completionTokens = Number(successResult.usage.completion_tokens ?? 0);
    const totalTokens = Number(
      successResult.usage.total_tokens ?? promptTokens + completionTokens
    );

    await writeUsageEvent({
      userId: user.id,
      conversationId: body.conversationId,
      roundId: body.roundId ?? null,
      modelId: body.modelId,
      promptTokens,
      completionTokens,
      totalTokens,
      latencyMs: successResult.latencyMs,
      status: "success",
      statusCode: successResult.statusCode,
      requestId,
    });
    usageLogged = true;

    return NextResponse.json({
      response: successResult.content,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      latencyMs: successResult.latencyMs,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    if (!usageLogged && resolvedUserId && resolvedModelId) {
      try {
        await writeUsageEvent({
          userId: resolvedUserId,
          conversationId: resolvedConversationId,
          roundId: resolvedRoundId,
          modelId: resolvedModelId,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs: Date.now() - startedAt,
          status: "error",
          statusCode: 500,
          requestId,
        });
      } catch {
        // Avoid secondary failures from masking the API error.
      }
    }

    return NextResponse.json(
      { error: "Generation failed due to a server error." },
      { status: 500 }
    );
  } finally {
    if (slot?.acquired) {
      await slot.release();
    }
  }
}
