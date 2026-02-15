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
import { writeUsageEvent } from "@/lib/server/usage-metering";
import { getOpenRouterBaseUrl, getOpenRouterHeaders } from "@/lib/server/env";

export const runtime = "nodejs";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1).max(120_000),
});

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  roundId: z.string().max(128).optional(),
  selectedAvatar: z.string().trim().min(1).max(64),
  modelId: z.string().trim().min(3).max(120),
  messages: z.array(messageSchema).min(1).max(200),
  idempotencyKey: z.string().trim().min(8).max(180).optional(),
});

const sseHeaders = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
} as const;

const writeSse = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown) => {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`event: ${event}\n`));
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
};

const parseChunkText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const maybeText = (value as { text?: unknown }).text;
    if (typeof maybeText === "string") return maybeText;
  }
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => {
      if (typeof part?.text === "string") return part.text;
      if (typeof part === "string") return part;
      return "";
    })
    .join("");
};

const extractDelta = (payload: unknown): string => {
  const choice = (
    payload as {
      choices?: Array<{
        delta?: { content?: unknown; reasoning?: unknown; text?: unknown };
        message?: { content?: unknown };
        text?: unknown;
      }>;
      output_text?: unknown;
    }
  )
    ?.choices?.[0];
  const candidates = [
    parseChunkText(choice?.delta?.content),
    parseChunkText(choice?.delta?.text),
    parseChunkText(choice?.delta?.reasoning),
    parseChunkText(choice?.message?.content),
    parseChunkText(choice?.text),
    parseChunkText((payload as { output_text?: unknown })?.output_text),
  ];
  return candidates.find((value) => value.length > 0) ?? "";
};

const extractUsage = (payload: unknown): { promptTokens: number; completionTokens: number; totalTokens: number } | null => {
  const usage = (payload as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown } })
    ?.usage;
  if (!usage) return null;
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
};

const parseUpstreamErrorMessage = async (response: Response): Promise<string | null> => {
  try {
    const raw = await response.text();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as
        | {
            error?:
              | string
              | {
                  message?: string;
                  code?: string | number;
                };
            message?: string;
          }
        | null;
      if (!parsed) return raw;
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        return parsed.error.trim();
      }
      if (
        parsed.error &&
        typeof parsed.error === "object" &&
        typeof parsed.error.message === "string" &&
        parsed.error.message.trim()
      ) {
        return parsed.error.message.trim();
      }
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message.trim();
      }
      return raw;
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
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
  let slotReleased = false;
  let streamOwnsSlot = false;

  const releaseSlot = async () => {
    if (!slot?.acquired || slotReleased) return;
    slotReleased = true;
    await slot.release();
  };

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
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
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
      identifier: `${identity.userKey}:generate-stream`,
      limit: 8,
      windowSec: 60,
    });
    if (!userLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limited. Try again in a few seconds.",
          retryAfterSec: userLimit.retryAfterSec,
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, userLimit.retryAfterSec)) },
        }
      );
    }

    const ipLimit = await enforceRateLimit({
      scope: "ip",
      identifier: `${identity.ipKey}:generate-stream`,
      limit: 25,
      windowSec: 60,
    });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        {
          error: "This IP is temporarily rate limited.",
          retryAfterSec: ipLimit.retryAfterSec,
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, ipLimit.retryAfterSec)) },
        }
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
          headers: { "Retry-After": String(cooldown) },
        }
      );
    }

    requestId =
      request.headers.get("x-idempotency-key") ??
      body.idempotencyKey ??
      buildDeterministicIdempotencyKey({
        prefix: "ai:generate-stream",
        payload: {
          conversationId: body.conversationId,
          roundId: body.roundId ?? null,
          selectedAvatar: body.selectedAvatar,
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

    const upstreamController = new AbortController();
    const timeout = setTimeout(() => upstreamController.abort(), 35_000);
    const { referer, title } = getOpenRouterHeaders();
    const endpoint = `${getOpenRouterBaseUrl()}/chat/completions`;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        ...(referer ? { "HTTP-Referer": referer } : {}),
        ...(title ? { "X-Title": title } : {}),
      },
      body: JSON.stringify({
        model: body.modelId,
        messages: body.messages,
        stream: true,
      }),
      cache: "no-store",
      signal: upstreamController.signal,
    });

    if (!upstream.ok || !upstream.body) {
      clearTimeout(timeout);
      if (upstream.status === 503 || upstream.status === 504) {
        await openCircuitFor({ provider: "openrouter", ttlSec: 20 });
      }
      const upstreamMessage = await parseUpstreamErrorMessage(upstream);

      await writeUsageEvent({
        userId: user.id,
        conversationId: body.conversationId,
        roundId: body.roundId ?? null,
        modelId: body.modelId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: Date.now() - startedAt,
        status: "error",
        statusCode: upstream.status || 502,
        requestId,
      });
      usageLogged = true;

      return NextResponse.json(
        {
          error:
            upstream.status === 429
              ? "OpenRouter rate limit reached."
              : upstreamMessage
              ? `OpenRouter request failed (${upstream.status}): ${upstreamMessage}`
              : `OpenRouter request failed (${upstream.status}).`,
          code: upstream.status === 429 ? "RATE_LIMITED" : "UPSTREAM_ERROR",
        },
        { status: upstream.status >= 400 ? upstream.status : 502 }
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const reader = upstream.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let content = "";
        let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
        let finished = false;

        const finalize = async (status: "success" | "error", statusCode: number, errorMessage?: string) => {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);

          try {
            await writeUsageEvent({
              userId: user.id,
              conversationId: body.conversationId,
              roundId: body.roundId ?? null,
              modelId: body.modelId,
              promptTokens: usage?.promptTokens ?? 0,
              completionTokens: usage?.completionTokens ?? 0,
              totalTokens: usage?.totalTokens ?? Math.max(0, content.length > 0 ? usage?.totalTokens ?? 0 : 0),
              latencyMs: Date.now() - startedAt,
              status,
              statusCode,
              requestId,
            });
            usageLogged = true;
          } catch {
            // Ignore metering failures in stream teardown.
          }

          await releaseSlot();

          if (status === "error") {
            writeSse(controller, "error", {
              error: errorMessage ?? "Streaming generation failed.",
              code: "STREAM_FAILED",
            });
          }

          if (!controller.desiredSize || controller.desiredSize >= 0) {
            controller.close();
          }
        };

        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return;
          const payloadRaw = trimmed.slice(5).trim();
          if (!payloadRaw) return;
          if (payloadRaw === "[DONE]") {
            writeSse(controller, "done", {
              content,
              usage,
              latencyMs: Date.now() - startedAt,
            });
            void finalize("success", 200);
            return;
          }

          try {
            const payload = JSON.parse(payloadRaw) as unknown;
            const delta = extractDelta(payload);
            const parsedUsage = extractUsage(payload);
            if (parsedUsage) usage = parsedUsage;
            if (delta) {
              content += delta;
              writeSse(controller, "delta", { chunk: delta });
            }
          } catch {
            // Ignore malformed chunk and continue stream.
          }
        };

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              let newlineIndex = buffer.indexOf("\n");
              while (newlineIndex >= 0) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                processLine(line);
                if (finished) return;
                newlineIndex = buffer.indexOf("\n");
              }
            }

            if (!finished) {
              if (buffer.trim().length > 0) {
                processLine(buffer);
              }
              if (!finished) {
                if (!content.trim()) {
                  void finalize(
                    "error",
                    502,
                    `OpenRouter returned an empty streamed response for ${body.modelId}.`
                  );
                  return;
                }
                writeSse(controller, "done", {
                  content,
                  usage,
                  latencyMs: Date.now() - startedAt,
                });
                await finalize("success", 200);
              }
            }
          } catch (error) {
            const aborted = error instanceof DOMException && error.name === "AbortError";
            if (!aborted) {
              await openCircuitFor({ provider: "openrouter", ttlSec: 20 });
            }
            await finalize("error", aborted ? 499 : 503, aborted ? "Generation cancelled." : "OpenRouter stream failed.");
          }
        };

        void pump();
      },
      cancel() {
        upstreamController.abort();
      },
    });

    const streamingResponse = new Response(stream, { status: 200, headers: sseHeaders });
    streamOwnsSlot = true;
    return streamingResponse;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        // Ignore usage write failure in error path.
      }
    }

    const message =
      error instanceof Error
        ? error.message
        : "Streaming generation failed due to a server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (!streamOwnsSlot) {
      await releaseSlot();
    }
  }
}
