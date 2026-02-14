import "server-only";

import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getByokEncryptionSecret } from "@/lib/server/env";

type Provider = "openrouter";
type ValidationStatus = "unknown" | "success" | "failed";

type UserApiKeyRow = {
  encrypted_key: string | null;
  encryption_kid: string | null;
  key_last4: string | null;
  last_validated_at: string | null;
  last_validation_error: string | null;
  last_validation_status: ValidationStatus | null;
  provider: Provider;
  store_key: boolean;
  updated_at: string;
};

type ByokStatus = {
  hasStoredKey: boolean;
  encryptionKid: string | null;
  lastValidatedAt: string | null;
  lastValidationError: string | null;
  lastValidationStatus: ValidationStatus;
  keyLast4: string | null;
  needsRevalidation: boolean;
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
const HEALTH_CHECK_STALE_MS = 6 * 60 * 60 * 1000;

type Keyring = {
  activeKid: string;
  keys: Map<string, Buffer>;
};

let keyringCache: Keyring | null = null;

const resolveLast4 = (key: string): string =>
  key.length >= 4 ? key.slice(-4) : key;

const cacheKeyFor = (userId: string, provider: Provider) => `${userId}:${provider}`;

const getLegacyAesKey = (): Buffer =>
  crypto.createHash("sha256").update(getByokEncryptionSecret()).digest();

const normalizeKeyMaterial = (raw: string): Buffer => {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("BYOK encryption key material must not be empty.");
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    const reEncoded = decoded.toString("base64").replace(/=+$/g, "");
    const normalized = trimmed.replace(/=+$/g, "");
    if (decoded.length === 32 && reEncoded === normalized) {
      return decoded;
    }
  } catch {
    // Fall through to deterministic hash.
  }

  return crypto.createHash("sha256").update(trimmed).digest();
};

const parseKeyringFromEnv = (): Keyring => {
  const raw = process.env.BYOK_ENCRYPTION_KEYRING?.trim() ?? "";
  const entries = raw
    .split(/[,\n;]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const keys = new Map<string, Buffer>();
  for (const entry of entries) {
    const divider = entry.includes("=") ? "=" : ":";
    const dividerIndex = entry.indexOf(divider);
    if (dividerIndex <= 0 || dividerIndex >= entry.length - 1) {
      continue;
    }
    const kid = entry.slice(0, dividerIndex).trim();
    const material = entry.slice(dividerIndex + 1).trim();
    if (!kid || !material) {
      continue;
    }
    keys.set(kid, normalizeKeyMaterial(material));
  }

  if (keys.size === 0) {
    keys.set("legacy-default", normalizeKeyMaterial(getByokEncryptionSecret()));
  }

  const configuredActiveKid = process.env.BYOK_ENCRYPTION_ACTIVE_KID?.trim();
  if (configuredActiveKid && !keys.has(configuredActiveKid)) {
    throw new Error(
      `Configured BYOK_ENCRYPTION_ACTIVE_KID "${configuredActiveKid}" is missing from BYOK_ENCRYPTION_KEYRING.`
    );
  }

  return {
    activeKid: configuredActiveKid ?? [...keys.keys()][0],
    keys,
  };
};

const getKeyring = (): Keyring => {
  if (!keyringCache) {
    keyringCache = parseKeyringFromEnv();
  }
  return keyringCache;
};

const b64 = (value: Buffer): string => value.toString("base64");

const fromB64 = (value: string): Buffer => Buffer.from(value, "base64");

const encryptBuffer = (plain: Buffer, key: Buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, encrypted };
};

const decryptBuffer = ({
  key,
  iv,
  tag,
  encrypted,
}: {
  key: Buffer;
  iv: Buffer;
  tag: Buffer;
  encrypted: Buffer;
}): Buffer => {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

const parsePayloadMeta = (
  payload: string
): { version: "v1" | "v2"; kid: string | null } => {
  const [version, kid] = payload.split(":");
  if (version === "v2") {
    return { version, kid: kid || null };
  }
  if (version === "v1") {
    return { version, kid: null };
  }
  throw new Error("Invalid encrypted key payload");
};

const shouldRevalidateByStatus = (status: ByokStatus): boolean => {
  if (!status.hasStoredKey) return false;
  if (!status.lastValidatedAt) return true;
  const parsed = Date.parse(status.lastValidatedAt);
  if (!Number.isFinite(parsed)) return true;
  return Date.now() - parsed > HEALTH_CHECK_STALE_MS;
};

export const encryptKey = (plainKey: string): string => {
  const { activeKid, keys } = getKeyring();
  const wrappingKey = keys.get(activeKid);
  if (!wrappingKey) {
    throw new Error(`Missing active BYOK encryption key for kid "${activeKid}".`);
  }

  const dek = crypto.randomBytes(32);
  const wrappedDek = encryptBuffer(dek, wrappingKey);
  const data = encryptBuffer(Buffer.from(plainKey, "utf8"), dek);

  return [
    "v2",
    activeKid,
    b64(wrappedDek.iv),
    b64(wrappedDek.tag),
    b64(wrappedDek.encrypted),
    b64(data.iv),
    b64(data.tag),
    b64(data.encrypted),
  ].join(":");
};

export const decryptKey = (payload: string): string => {
  const segments = payload.split(":");
  const version = segments[0];
  if (version === "v2") {
    const [
      _v2,
      kid,
      wrapIvB64,
      wrapTagB64,
      wrappedDekB64,
      dataIvB64,
      dataTagB64,
      encryptedB64,
    ] = segments;

    if (
      !kid ||
      !wrapIvB64 ||
      !wrapTagB64 ||
      !wrappedDekB64 ||
      !dataIvB64 ||
      !dataTagB64 ||
      !encryptedB64
    ) {
      throw new Error("Invalid encrypted key payload");
    }

    const { keys } = getKeyring();
    const wrappingKey = keys.get(kid);
    if (!wrappingKey) {
      throw new Error(`Unknown BYOK encryption key id "${kid}".`);
    }

    const dek = decryptBuffer({
      key: wrappingKey,
      iv: fromB64(wrapIvB64),
      tag: fromB64(wrapTagB64),
      encrypted: fromB64(wrappedDekB64),
    });

    const decrypted = decryptBuffer({
      key: dek,
      iv: fromB64(dataIvB64),
      tag: fromB64(dataTagB64),
      encrypted: fromB64(encryptedB64),
    });

    return decrypted.toString("utf8");
  }

  const [_legacyVersion, ivB64, tagB64, encryptedB64] = segments;
  if (version !== "v1" || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error("Invalid encrypted key payload");
  }

  const decrypted = decryptBuffer({
    key: getLegacyAesKey(),
    iv: fromB64(ivB64),
    tag: fromB64(tagB64),
    encrypted: fromB64(encryptedB64),
  });
  return decrypted.toString("utf8");
};

const getUserApiKeyRow = async (
  supabase: SupabaseClient,
  userId: string,
  provider: Provider
): Promise<UserApiKeyRow | null> => {
  const { data, error } = await supabase
    .from("user_api_keys")
    .select(
      "provider, encrypted_key, encryption_kid, key_last4, store_key, updated_at, last_validated_at, last_validation_status, last_validation_error"
    )
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
  const status: ByokStatus = {
    provider,
    hasStoredKey: Boolean(row?.store_key && row?.encrypted_key),
    encryptionKid: row?.encryption_kid ?? null,
    lastValidatedAt: row?.last_validated_at ?? null,
    lastValidationError: row?.last_validation_error ?? null,
    lastValidationStatus: row?.last_validation_status ?? "unknown",
    keyLast4: row?.key_last4 ?? null,
    needsRevalidation: false,
    storeKey: Boolean(row?.store_key),
    updatedAt: row?.updated_at ?? null,
    hasDevFallbackKey,
  };
  status.needsRevalidation = shouldRevalidateByStatus(status);
  return status;
};

export const saveByokKey = async ({
  supabase,
  userId,
  provider,
  plainKey,
}: {
  supabase: SupabaseClient;
  userId: string;
  provider?: Provider;
  plainKey: string;
}): Promise<ByokStatus> => {
  const safeProvider: Provider = provider ?? "openrouter";
  const normalizedKey = plainKey?.trim();
  if (!normalizedKey) {
    throw new Error("Provide an OpenRouter key before saving.");
  }

  const encryptedKey = encryptKey(normalizedKey);
  const payloadMeta = parsePayloadMeta(encryptedKey);
  const upsertResult = await supabase.from("user_api_keys").upsert(
    {
      user_id: userId,
      provider: safeProvider,
      encrypted_key: encryptedKey,
      encryption_kid: payloadMeta.kid,
      key_last4: resolveLast4(normalizedKey),
      store_key: true,
      last_validated_at: new Date().toISOString(),
      last_validation_status: "success",
      last_validation_error: null,
    },
    {
      onConflict: "user_id,provider",
    }
  );

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message);
  }

  decryptedKeyCache.delete(cacheKeyFor(userId, safeProvider));

  return getByokStatus(supabase, userId, safeProvider);
};

export const updateByokValidationState = async ({
  supabase,
  userId,
  provider,
  status,
  errorMessage,
  validatedAt,
}: {
  supabase: SupabaseClient;
  userId: string;
  provider?: Provider;
  status: ValidationStatus;
  errorMessage?: string | null;
  validatedAt?: string | null;
}): Promise<void> => {
  const safeProvider: Provider = provider ?? "openrouter";
  const validationTime = validatedAt ?? new Date().toISOString();
  const { error } = await supabase
    .from("user_api_keys")
    .update({
      last_validated_at: status === "unknown" ? null : validationTime,
      last_validation_status: status,
      last_validation_error: status === "success" || status === "unknown"
        ? null
        : (errorMessage ?? "Validation failed").slice(0, 500),
    })
    .eq("user_id", userId)
    .eq("provider", safeProvider);

  if (error) {
    throw new Error(error.message);
  }
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
  const upsertResult = await supabase
    .from("user_api_keys")
    .upsert(
      {
        user_id: userId,
        provider: safeProvider,
        encrypted_key: null,
        encryption_kid: null,
        key_last4: null,
        store_key: false,
        last_validated_at: null,
        last_validation_status: "unknown",
        last_validation_error: null,
      },
      { onConflict: "user_id,provider" }
    );

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message);
  }

  decryptedKeyCache.delete(cacheKeyFor(userId, safeProvider));
};

export const getEffectiveOpenRouterKey = async ({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> => {
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
  const payloadMeta = parsePayloadMeta(record.encrypted_key);
  const activeKid = getKeyring().activeKid;
  const shouldReencrypt =
    payloadMeta.version !== "v2" || payloadMeta.kid !== activeKid;

  if (shouldReencrypt) {
    const reencrypted = encryptKey(plainKey);
    const reencryptedMeta = parsePayloadMeta(reencrypted);
    const updateResult = await supabase
      .from("user_api_keys")
      .update({
        encrypted_key: reencrypted,
        encryption_kid: reencryptedMeta.kid,
        key_last4: record.key_last4 ?? resolveLast4(plainKey),
        store_key: true,
      })
      .eq("user_id", userId)
      .eq("provider", "openrouter");

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    decryptedKeyCache.set(cacheKey, {
      cachedAt: Date.now(),
      encryptedKey: reencrypted,
      plainKey,
    });
    return plainKey;
  }

  decryptedKeyCache.set(cacheKey, {
    cachedAt: Date.now(),
    encryptedKey: record.encrypted_key,
    plainKey,
  });
  return plainKey;
};
