import "server-only";

import { getUpstashEnv } from "@/lib/server/env";

type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec: number;
};

type ConcurrencyResult = {
  acquired: boolean;
  active: number;
  release: () => Promise<void>;
};

type UpstashResponse = {
  result: unknown;
  error?: string;
};

const inMemoryCounters = new Map<string, { count: number; expiresAt: number }>();
const inMemoryIdempotency = new Map<string, number>();
const inMemoryConcurrency = new Map<string, { count: number; expiresAt: number }>();
const inMemoryCircuit = new Map<string, number>();

const isProduction = process.env.NODE_ENV === "production";
const trustProxyHeaders = process.env.TRUST_PROXY_HEADERS === "true";
const upstashTimeoutMs = 2500;

const getNow = () => Date.now();

const getClientIp = (request: Request): string => {
  if (trustProxyHeaders) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp;
  }
  return "unknown";
};

const getUpstashConfig = () => {
  const { url, token } = getUpstashEnv();
  if (!url || !token) return null;
  return { url, token };
};

const upstashCommand = async (command: Array<string | number>) => {
  const config = getUpstashConfig();
  if (!config) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), upstashTimeoutMs);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as UpstashResponse;
    if (payload.error) return null;
    return payload.result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const consumeInMemoryLimit = (
  key: string,
  limit: number,
  windowSec: number
): RateLimitResult => {
  const now = getNow();
  const existing = inMemoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    inMemoryCounters.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
    return { allowed: true, count: 1, limit, retryAfterSec: windowSec };
  }

  existing.count += 1;
  inMemoryCounters.set(key, existing);
  const retryAfterSec = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
  return {
    allowed: existing.count <= limit,
    count: existing.count,
    limit,
    retryAfterSec,
  };
};

const consumeUpstashLimit = async (
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult | null> => {
  const incremented = await upstashCommand(["INCR", key]);
  if (incremented == null) return null;
  const count = Number(incremented);
  if (!Number.isFinite(count)) return null;
  if (count === 1) {
    await upstashCommand(["EXPIRE", key, windowSec]);
  }
  const ttlResult = await upstashCommand(["TTL", key]);
  const ttl = Number(ttlResult);
  const retryAfterSec = Number.isFinite(ttl) && ttl > 0 ? ttl : windowSec;
  return {
    allowed: count <= limit,
    count,
    limit,
    retryAfterSec,
  };
};

export const enforceRateLimit = async ({
  scope,
  identifier,
  limit,
  windowSec,
}: {
  scope: "user" | "ip";
  identifier: string;
  limit: number;
  windowSec: number;
}): Promise<RateLimitResult> => {
  const key = `ratelimit:${scope}:${identifier}`;
  const distributedResult = await consumeUpstashLimit(key, limit, windowSec);
  if (distributedResult) return distributedResult;
  if (isProduction) {
    return { allowed: false, count: limit + 1, limit, retryAfterSec: windowSec };
  }
  return consumeInMemoryLimit(key, limit, windowSec);
};

export const claimIdempotencyKey = async ({
  userId,
  key,
  ttlSec = 120,
}: {
  userId: string;
  key: string;
  ttlSec?: number;
}): Promise<boolean> => {
  const scopedKey = `idem:${userId}:${key}`;
  const setResult = await upstashCommand([
    "SET",
    scopedKey,
    "1",
    "NX",
    "EX",
    ttlSec,
  ]);
  if (setResult != null) {
    return setResult === "OK";
  }
  if (isProduction) {
    return false;
  }

  const now = getNow();
  const existingExpiry = inMemoryIdempotency.get(scopedKey);
  if (existingExpiry && existingExpiry > now) {
    return false;
  }
  inMemoryIdempotency.set(scopedKey, now + ttlSec * 1000);
  return true;
};

export const acquireUserConcurrencySlot = async ({
  userId,
  maxConcurrent = 2,
  ttlSec = 90,
}: {
  userId: string;
  maxConcurrent?: number;
  ttlSec?: number;
}): Promise<ConcurrencyResult> => {
  const key = `concurrency:${userId}`;

  const releaseDistributed = async () => {
    const script = `
      local next = redis.call("DECR", KEYS[1])
      if next <= 0 then
        redis.call("DEL", KEYS[1])
        return 0
      end
      redis.call("EXPIRE", KEYS[1], tonumber(ARGV[1]))
      return next
    `;
    await upstashCommand(["EVAL", script, "1", key, ttlSec]);
  };

  const acquireScript = `
    local current = redis.call("INCR", KEYS[1])
    redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
    if current > tonumber(ARGV[1]) then
      local next = redis.call("DECR", KEYS[1])
      if next <= 0 then
        redis.call("DEL", KEYS[1])
        next = 0
      end
      return {0, next}
    end
    return {1, current}
  `;
  const distributed = await upstashCommand([
    "EVAL",
    acquireScript,
    "1",
    key,
    maxConcurrent,
    ttlSec,
  ]);
  if (distributed != null && Array.isArray(distributed)) {
    const acquired = Number(distributed[0]) === 1;
    const active = Number(distributed[1] ?? 0);
    return {
      acquired,
      active,
      release: acquired ? releaseDistributed : async () => undefined,
    };
  }
  if (isProduction) {
    return { acquired: false, active: maxConcurrent + 1, release: async () => undefined };
  }

  const now = getNow();
  const local = inMemoryConcurrency.get(key);
  const current = !local || local.expiresAt <= now ? 0 : local.count;
  const next = current + 1;
  if (next > maxConcurrent) {
    return {
      acquired: false,
      active: next,
      release: async () => undefined,
    };
  }
  inMemoryConcurrency.set(key, { count: next, expiresAt: now + ttlSec * 1000 });
  return {
    acquired: true,
    active: next,
    release: async () => {
      const existing = inMemoryConcurrency.get(key);
      if (!existing) return;
      const remaining = Math.max(0, existing.count - 1);
      if (remaining === 0) {
        inMemoryConcurrency.delete(key);
      } else {
        inMemoryConcurrency.set(key, {
          count: remaining,
          expiresAt: Math.max(existing.expiresAt, getNow() + 1000),
        });
      }
    },
  };
};

export const getCircuitCooldownSec = async (provider: "openrouter"): Promise<number> => {
  const key = `circuit:${provider}:cooldown`;
  const distributedTtl = await upstashCommand(["TTL", key]);
  if (distributedTtl != null) {
    const ttl = Number(distributedTtl);
    if (Number.isFinite(ttl) && ttl > 0) return ttl;
    return 0;
  }
  if (isProduction) {
    return 15;
  }

  const expiresAt = inMemoryCircuit.get(key);
  if (!expiresAt) return 0;
  const remainingMs = expiresAt - getNow();
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
};

export const openCircuitFor = async ({
  provider,
  ttlSec,
}: {
  provider: "openrouter";
  ttlSec: number;
}): Promise<void> => {
  const key = `circuit:${provider}:cooldown`;
  const distributed = await upstashCommand(["SET", key, "1", "EX", ttlSec]);
  if (distributed != null) return;
  if (isProduction) return;
  inMemoryCircuit.set(key, getNow() + ttlSec * 1000);
};

export const resolveRequestIdentity = (
  request: Request,
  userId: string
): { userKey: string; ipKey: string } => {
  const clientIp = getClientIp(request);
  return {
    userKey: userId,
    ipKey: clientIp,
  };
};
