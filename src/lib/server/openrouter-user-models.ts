import "server-only";

import { createHash } from "crypto";
import { getOpenRouterBaseUrl, getOpenRouterHeaders } from "@/lib/server/env";

type CacheEntry = {
  expiresAt: number;
  modelIds: string[] | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const userModelCache = new Map<string, CacheEntry>();

const toCacheKey = (apiKey: string): string =>
  createHash("sha256").update(apiKey).digest("hex").slice(0, 24);

const normalizeModelIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = (item as { id?: unknown }).id;
      return typeof id === "string" ? id.trim() : null;
    })
    .filter((id): id is string => Boolean(id && id.length > 0));
  return Array.from(new Set(ids));
};

const parseUserModelPayload = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  return normalizeModelIds(data);
};

export const getUserPolicyModelAllowlist = async (
  apiKey: string
): Promise<string[] | null> => {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) return null;

  const cacheKey = toCacheKey(normalizedKey);
  const now = Date.now();
  const cached = userModelCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.modelIds;
  }

  const endpoint = `${getOpenRouterBaseUrl()}/models/user`;
  const { referer, title } = getOpenRouterHeaders();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${normalizedKey}`,
        "Content-Type": "application/json",
        ...(referer ? { "HTTP-Referer": referer } : {}),
        ...(title ? { "X-Title": title } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      userModelCache.set(cacheKey, {
        expiresAt: now + CACHE_TTL_MS,
        modelIds: null,
      });
      return null;
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    const modelIds = parseUserModelPayload(payload);

    userModelCache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      modelIds: modelIds.length > 0 ? modelIds : null,
    });

    return modelIds.length > 0 ? modelIds : null;
  } catch {
    userModelCache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      modelIds: null,
    });
    return null;
  }
};

