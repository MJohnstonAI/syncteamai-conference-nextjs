import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestUser } from "@/lib/server/supabase-server";
import { getEffectiveOpenRouterKey } from "@/lib/server/byok";
import { canGenerate, getEntitlementTier } from "@/lib/server/entitlements";
import {
  acquireUserConcurrencySlot,
  buildDeterministicIdempotencyKey,
  claimIdempotencyKey,
  enforceRateLimit,
  getCircuitCooldownSec,
  openCircuitFor,
  resolveRequestIdentity,
} from "@/lib/server/rate-limit";
import { callOpenRouter, type OpenRouterResult } from "@/lib/server/openrouter";
import { getUserPolicyModelAllowlist } from "@/lib/server/openrouter-user-models";
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

const FALLBACK_MODEL_LADDER: string[] = [
  "google/gemini-2.5-flash",
  "anthropic/claude-haiku-3.5",
  "meta/llama-3.3-70b-instruct",
  "openai/gpt-4o-mini",
];

const providerFallbacks: Record<string, string[]> = {
  openai: ["openai/gpt-4o-mini", "google/gemini-2.5-flash", "anthropic/claude-haiku-3.5"],
  anthropic: ["anthropic/claude-haiku-3.5", "google/gemini-2.5-flash", "openai/gpt-4o-mini"],
  google: ["google/gemini-2.5-flash", "anthropic/claude-haiku-3.5", "openai/gpt-4o-mini"],
  xai: ["google/gemini-2.5-flash", "anthropic/claude-haiku-3.5"],
  meta: ["google/gemini-2.5-flash", "anthropic/claude-haiku-3.5"],
};

const resolveFallbackCandidates = (
  modelId: string,
  allowedModelIds?: string[] | null
): string[] => {
  const provider = modelId.split("/")[0]?.toLowerCase() ?? "";
  const providerCandidates = providerFallbacks[provider] ?? [];
  const candidates = Array.from(
    new Set([modelId, ...providerCandidates, ...FALLBACK_MODEL_LADDER])
  );

  if (!allowedModelIds || allowedModelIds.length === 0) {
    return candidates.slice(0, 8);
  }

  const allowedSet = new Set(
    allowedModelIds
      .map((candidate) => candidate.trim())
      .filter((candidate) => candidate.length > 0)
  );

  const filtered = candidates.filter((candidate) => allowedSet.has(candidate));
  if (filtered.length > 0) {
    return filtered.slice(0, 8);
  }

  return candidates.slice(0, 8);
};

const shouldRetryWithFallbackModel = (
  result: Extract<OpenRouterResult, { ok: false }>
): boolean => {
  if (result.errorCode === "INVALID_RESPONSE") {
    return true;
  }
  if (result.errorCode === "TIMEOUT" || result.errorCode === "UPSTREAM_UNAVAILABLE") {
    return true;
  }
  if (result.statusCode === 429 || result.statusCode >= 500) {
    return true;
  }
  if (result.statusCode === 401 || result.statusCode === 403) {
    return false;
  }

  const normalized = result.message.toLowerCase();
  if (result.statusCode === 404) {
    return (
      normalized.includes("no endpoints found") ||
      normalized.includes("data policy") ||
      normalized.includes("zero data retention")
    );
  }
  if (result.statusCode === 400 || result.statusCode === 422) {
    return (
      normalized.includes("model") ||
      normalized.includes("endpoint") ||
      normalized.includes("data policy")
    );
  }
  return false;
};

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
      buildDeterministicIdempotencyKey({
        prefix: "ai:generate",
        payload: {
          conversationId: body.conversationId,
          roundId: body.roundId ?? null,
          selectedAvatar: body.selectedAvatar ?? null,
          modelId: body.modelId,
          messages: body.messages,
        },
      });

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

    const requestedModelId = body.modelId;
    const allowedModelIds = await getUserPolicyModelAllowlist(openRouterKey);
    const modelCandidates = resolveFallbackCandidates(requestedModelId, allowedModelIds);
    let openRouterResult: OpenRouterResult | null = null;
    let resolvedModelForGeneration = requestedModelId;
    let fallbackFromModel: string | null =
      modelCandidates.length > 0 && modelCandidates[0] !== requestedModelId
        ? requestedModelId
        : null;

    for (let index = 0; index < modelCandidates.length; index += 1) {
      const candidateModelId = modelCandidates[index];
      const candidateResult = await callOpenRouter({
        apiKey: openRouterKey,
        modelId: candidateModelId,
        messages: body.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        timeoutMs: 25_000,
        maxRetries: 2,
      });

      openRouterResult = candidateResult;
      resolvedModelForGeneration = candidateModelId;
      if (candidateResult.ok) {
        break;
      }

      if (
        index < modelCandidates.length - 1 &&
        shouldRetryWithFallbackModel(candidateResult as Extract<OpenRouterResult, { ok: false }>)
      ) {
        if (!fallbackFromModel) {
          fallbackFromModel = requestedModelId;
        }
        continue;
      }
      break;
    }

    if (!openRouterResult) {
      throw new Error("Model selection failed before OpenRouter call.");
    }

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
        modelId: resolvedModelForGeneration,
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
          error:
            fallbackFromModel && resolvedModelForGeneration !== requestedModelId
              ? `${failedResult.message} (fallback from ${requestedModelId} to ${resolvedModelForGeneration} also failed)`
              : failedResult.message,
          code: failedResult.errorCode,
          retryAfterSec: failedResult.retryAfterSec,
          modelIdUsed: resolvedModelForGeneration,
          fallbackFromModel: fallbackFromModel ?? undefined,
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
      modelId: resolvedModelForGeneration,
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
      modelIdUsed: resolvedModelForGeneration,
      fallbackFromModel: fallbackFromModel ?? undefined,
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
      return NextResponse.json(
        {
          error: "Invalid request payload.",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
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

    const message =
      error instanceof Error ? error.message : "Generation failed due to a server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (slot?.acquired) {
      await slot.release();
    }
  }
}
