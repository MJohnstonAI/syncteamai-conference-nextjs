import "server-only";

import { getOpenRouterBaseUrl, getOpenRouterHeaders } from "@/lib/server/env";

type OpenRouterMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type OpenRouterChoice = {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
};

export type OpenRouterResult =
  | {
      ok: true;
      content: string;
      usage: OpenRouterUsage;
      statusCode: number;
      latencyMs: number;
    }
  | {
      ok: false;
      statusCode: number;
      retryAfterSec?: number;
      errorCode:
        | "RATE_LIMITED"
        | "UPSTREAM_UNAVAILABLE"
        | "TIMEOUT"
        | "INVALID_RESPONSE"
        | "UPSTREAM_ERROR";
      message: string;
      latencyMs: number;
    };

const parseContent = (value: OpenRouterChoice["message"]["content"]): string => {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const callOpenRouter = async ({
  apiKey,
  modelId,
  messages,
  timeoutMs = 25_000,
  maxRetries = 2,
}: {
  apiKey: string;
  modelId: string;
  messages: OpenRouterMessage[];
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<OpenRouterResult> => {
  const endpoint = `${getOpenRouterBaseUrl()}/chat/completions`;
  const { referer, title } = getOpenRouterHeaders();
  const transientStatuses = new Set([429, 502, 503, 504]);
  const startedAt = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(referer ? { "HTTP-Referer": referer } : {}),
          ...(title ? { "X-Title": title } : {}),
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined;

        if (transientStatuses.has(response.status) && attempt < maxRetries) {
          const baseBackoff = Math.min(2000, 350 * (attempt + 1));
          await sleep(baseBackoff + Math.floor(Math.random() * 150));
          continue;
        }

        return {
          ok: false,
          statusCode: response.status,
          retryAfterSec:
            Number.isFinite(retryAfterSec) && retryAfterSec && retryAfterSec > 0
              ? retryAfterSec
              : undefined,
          errorCode:
            response.status === 429
              ? "RATE_LIMITED"
              : response.status === 503
              ? "UPSTREAM_UNAVAILABLE"
              : "UPSTREAM_ERROR",
          message:
            response.status === 429
              ? "OpenRouter rate limit reached."
              : response.status === 503
              ? "OpenRouter is temporarily unavailable."
              : `OpenRouter error (${response.status}).`,
          latencyMs,
        };
      }

      const payload = (await response.json()) as OpenRouterResponse;
      const content = parseContent(payload?.choices?.[0]?.message?.content);
      if (!content) {
        return {
          ok: false,
          statusCode: 502,
          errorCode: "INVALID_RESPONSE",
          message: "OpenRouter returned an empty completion.",
          latencyMs,
        };
      }

      return {
        ok: true,
        content,
        usage: payload.usage ?? {},
        statusCode: response.status,
        latencyMs,
      };
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (!isAbort && attempt < maxRetries) {
        const backoff = Math.min(2000, 350 * (attempt + 1));
        await sleep(backoff + Math.floor(Math.random() * 150));
        continue;
      }
      return {
        ok: false,
        statusCode: 503,
        errorCode: isAbort ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE",
        message: isAbort
          ? "OpenRouter request timed out."
          : "OpenRouter request failed.",
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    statusCode: 503,
    errorCode: "UPSTREAM_UNAVAILABLE",
    message: "OpenRouter retry budget exhausted.",
    latencyMs: Date.now() - startedAt,
  };
};
