import "server-only";

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getByokEncryptionSecret } from "@/lib/server/env";

type Provider = "openrouter";

type UserApiKeyRow = {
  encrypted_key: string | null;
  key_last4: string | null;
  provider: Provider;
  store_key: boolean;
  updated_at: string;
};

type ByokStatus = {
  hasStoredKey: boolean;
  keyLast4: string | null;
  provider: Provider;
  storeKey: boolean;
  updatedAt: string | null;
  hasDevFallbackKey: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const decryptedKeyCache = new Map<
  string,
  { cachedAt: number; encryptedKey: string; plainKey: string }
>();

const resolveLast4 = (key: string): string =>
  key.length >= 4 ? key.slice(-4) : key;

const cacheKeyFor = (userId: string, provider: Provider) => `${userId}:${provider}`;

const getAesKey = (): Buffer =>
  crypto.createHash("sha256").update(getByokEncryptionSecret()).digest();

export const encryptKey = (plainKey: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getAesKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptKey = (payload: string): string => {
  const [version, ivB64, tagB64, encryptedB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted key payload");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getAesKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};

const getUserApiKeyRow = async (
  supabase: SupabaseClient,
  userId: string,
  provider: Provider
): Promise<UserApiKeyRow | null> => {
  const { data, error } = await supabase
    .from("user_api_keys")
    .select("provider, encrypted_key, key_last4, store_key, updated_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserApiKeyRow | null) ?? null;
};

export const getByokStatus = async (
  supabase: SupabaseClient,
  userId: string,
  provider: Provider = "openrouter"
): Promise<ByokStatus> => {
  const row = await getUserApiKeyRow(supabase, userId, provider);
  const devFallbackKey = process.env.OPENROUTER_DEV_TEST_KEY?.trim();
  const hasDevFallbackKey =
    process.env.NODE_ENV !== "production" && Boolean(devFallbackKey);
  return {
    provider,
    hasStoredKey: Boolean(row?.store_key && row?.encrypted_key),
    keyLast4: row?.key_last4 ?? null,
    storeKey: Boolean(row?.store_key),
    updatedAt: row?.updated_at ?? null,
    hasDevFallbackKey,
  };
};

export const saveByokKey = async ({
  supabase,
  userId,
  provider,
  plainKey,
  storeKey,
}: {
  supabase: SupabaseClient;
  userId: string;
  provider?: Provider;
  plainKey?: string;
  storeKey: boolean;
}): Promise<ByokStatus> => {
  const safeProvider: Provider = provider ?? "openrouter";
  const normalizedKey = plainKey?.trim();
  const existing = await getUserApiKeyRow(supabase, userId, safeProvider);
  const existingLast4 = existing?.key_last4 ?? null;

  const encryptedKey = storeKey
    ? normalizedKey
      ? encryptKey(normalizedKey)
      : existing?.encrypted_key ?? null
    : null;
  const keyLast4 = storeKey
    ? normalizedKey
      ? resolveLast4(normalizedKey)
      : existingLast4
    : null;

  const { error } = await supabase.from("user_api_keys").upsert(
    {
      user_id: userId,
      provider: safeProvider,
      encrypted_key: encryptedKey,
      key_last4: keyLast4,
      store_key: storeKey,
    },
    {
      onConflict: "user_id,provider",
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!storeKey) {
    decryptedKeyCache.delete(cacheKeyFor(userId, safeProvider));
  }

  return getByokStatus(supabase, userId, safeProvider);
};

export const removeByokKey = async ({
  supabase,
  userId,
  provider,
}: {
  supabase: SupabaseClient;
  userId: string;
  provider?: Provider;
}): Promise<void> => {
  const safeProvider: Provider = provider ?? "openrouter";
  const { error } = await supabase
    .from("user_api_keys")
    .upsert(
      {
        user_id: userId,
        provider: safeProvider,
        encrypted_key: null,
        key_last4: null,
        store_key: false,
      },
      { onConflict: "user_id,provider" }
    );

  if (error) {
    throw new Error(error.message);
  }

  decryptedKeyCache.delete(cacheKeyFor(userId, safeProvider));
};

export const getEffectiveOpenRouterKey = async ({
  supabase,
  userId,
  sessionKey,
}: {
  supabase: SupabaseClient;
  userId: string;
  sessionKey?: string;
}): Promise<string | null> => {
  const providedKey = sessionKey?.trim();
  if (providedKey) {
    return providedKey;
  }

  const record = await getUserApiKeyRow(supabase, userId, "openrouter");
  if (!record?.store_key || !record.encrypted_key) {
    decryptedKeyCache.delete(cacheKeyFor(userId, "openrouter"));
    const devFallbackKey = process.env.OPENROUTER_DEV_TEST_KEY?.trim();
    if (process.env.NODE_ENV !== "production" && devFallbackKey) {
      return devFallbackKey;
    }
    return null;
  }

  const cacheKey = cacheKeyFor(userId, "openrouter");
  const cached = decryptedKeyCache.get(cacheKey);
  if (
    cached &&
    cached.encryptedKey === record.encrypted_key &&
    Date.now() - cached.cachedAt < CACHE_TTL_MS
  ) {
    return cached.plainKey;
  }

  const plainKey = decryptKey(record.encrypted_key);
  decryptedKeyCache.set(cacheKey, {
    cachedAt: Date.now(),
    encryptedKey: record.encrypted_key,
    plainKey,
  });
  return plainKey;
};
