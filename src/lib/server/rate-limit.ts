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

const getNow = () => Date.now();

const getClientIp = (request: Request): string => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
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

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as UpstashResponse;
  if (payload.error) return null;
  return payload.result;
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
    await upstashCommand(["DECR", key]);
  };

  const distributed = await upstashCommand(["INCR", key]);
  if (distributed != null) {
    const active = Number(distributed);
    if (active === 1) {
      await upstashCommand(["EXPIRE", key, ttlSec]);
    }
    if (active > maxConcurrent) {
      await upstashCommand(["DECR", key]);
      return {
        acquired: false,
        active,
        release: async () => undefined,
      };
    }
    return {
      acquired: true,
      active,
      release: releaseDistributed,
    };
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
