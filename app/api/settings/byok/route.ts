import { NextResponse } from "next/server";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  getByokStatus,
  getEffectiveOpenRouterKey,
  removeByokKey,
  saveByokKey,
  updateByokValidationState,
} from "@/lib/server/byok";
import {
  getByokEncryptionSecret,
  getOpenRouterBaseUrl,
  getOpenRouterHeaders,
} from "@/lib/server/env";
import { requireRequestUser } from "@/lib/server/supabase-server";
import { enforceRateLimit, resolveRequestIdentity } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const updateSchema = z.object({
  provider: z.literal("openrouter").default("openrouter"),
  key: z
    .string()
    .trim()
    .min(10)
    .max(500)
    .regex(/^\S+$/, "OpenRouter key must not contain whitespace"),
}).strict();

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
} as const;

const jsonNoStore = (body: unknown, init?: ResponseInit) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...(init?.headers ?? {}),
    },
  });

const unauthorized = () => jsonNoStore({ error: "Unauthorized" }, { status: 401 });
const forbidden = (message: string) =>
  jsonNoStore({ error: message, code: "FORBIDDEN_ORIGIN" }, { status: 403 });

const tooManyRequests = (retryAfterSec: number) =>
  jsonNoStore(
    {
      error: "Too many key update attempts. Please retry shortly.",
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

const normalizeOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return null;
  }
};

const getAllowedOrigins = (request: Request): string[] => {
  const allowed = new Set<string>();
  const appUrlOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL ?? null);
  if (appUrlOrigin) {
    allowed.add(appUrlOrigin);
  }

  const headerHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const headerProtoRaw = request.headers.get("x-forwarded-proto");
  const headerProto = headerProtoRaw?.split(",")[0]?.trim();
  if (headerHost) {
    const protocol =
      headerProto && (headerProto === "https" || headerProto === "http")
        ? headerProto
        : new URL(request.url).protocol.replace(":", "");
    allowed.add(`${protocol}://${headerHost}`.toLowerCase());
  }

  const requestOrigin = normalizeOrigin(request.url);
  if (requestOrigin) {
    allowed.add(requestOrigin);
  }

  return [...allowed];
};

const isTrustedMutationRequest = (request: Request): boolean => {
  const allowedOrigins = getAllowedOrigins(request);
  if (allowedOrigins.length === 0) {
    return true;
  }

  const origin = normalizeOrigin(request.headers.get("origin"));
  if (origin) {
    return allowedOrigins.includes(origin);
  }

  const refererOrigin = normalizeOrigin(request.headers.get("referer"));
  if (refererOrigin) {
    return allowedOrigins.includes(refererOrigin);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    return false;
  }

  return true;
};

type ValidationResult = {
  ok: boolean;
  statusCode: number | null;
  message: string | null;
};

const resolveAuditSalt = (): string =>
  process.env.BYOK_AUDIT_SALT?.trim() || getByokEncryptionSecret();

const hashAuditField = (value: string | null): string | null => {
  if (!value) return null;
  return crypto
    .createHash("sha256")
    .update(`${resolveAuditSalt()}:${value}`)
    .digest("hex")
    .slice(0, 40);
};

const extractClientIp = (request: Request): string | null => {
  const raw =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip");
  if (!raw) return null;
  return raw.split(",")[0]?.trim() ?? null;
};

const recordAuditEvent = async ({
  supabase,
  request,
  userId,
  action,
  success,
  statusCode,
  errorCode,
  metadata,
}: {
  supabase: SupabaseClient;
  request: Request;
  userId: string;
  action: "validate" | "save" | "remove" | "status_check";
  success: boolean;
  statusCode?: number | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  try {
    const { error } = await supabase.from("user_api_key_audit_events").insert({
      user_id: userId,
      provider: "openrouter",
      action,
      success,
      status_code: statusCode ?? null,
      error_code: errorCode ?? null,
      ip_hash: hashAuditField(extractClientIp(request)),
      user_agent_hash: hashAuditField(request.headers.get("user-agent")),
      metadata: metadata ?? {},
      source: "api",
    });
    if (error) {
      console.warn("[BYOK] Failed to write BYOK audit event:", error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown audit error";
    console.warn("[BYOK] Failed to write BYOK audit event:", message);
  }
};

const classifyServerError = (error: unknown): { status: number; message: string } => {
  const raw = error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase();

  if (
    normalized.includes("openrouter key must not contain whitespace") ||
    normalized.includes("invalid byok payload")
  ) {
    return { status: 400, message: "Invalid OpenRouter key format." };
  }

  if (normalized.includes("missing required environment variable: byok_encryption_key")) {
    return {
      status: 500,
      message: "Server BYOK encryption is not configured.",
    };
  }

  if (
    normalized.includes("relation \"public.user_api_keys\" does not exist") ||
    normalized.includes("relation \"user_api_keys\" does not exist")
  ) {
    return {
      status: 500,
      message: "BYOK storage is not initialized. Apply latest Supabase migrations.",
    };
  }

  if (
    normalized.includes("column user_api_keys.key_last4 does not exist") ||
    normalized.includes("column user_api_keys.store_key does not exist") ||
    normalized.includes("column user_api_keys.encryption_kid does not exist") ||
    normalized.includes("column user_api_keys.last_validated_at does not exist") ||
    normalized.includes("column user_api_keys.last_validation_status does not exist") ||
    normalized.includes("could not find the 'key_last4' column") ||
    normalized.includes("could not find the 'store_key' column") ||
    normalized.includes("could not find the 'encryption_kid' column") ||
    normalized.includes("could not find the 'last_validated_at' column") ||
    normalized.includes("could not find the 'last_validation_status' column")
  ) {
    return {
      status: 500,
      message: "BYOK schema is outdated. Apply latest Supabase migrations.",
    };
  }

  if (
    normalized.includes("column \"last_four\"") ||
    normalized.includes("column user_api_keys.last_four") ||
    normalized.includes("user_api_keys_last_four") ||
    normalized.includes("last_four")
  ) {
    return {
      status: 500,
      message: "BYOK schema is outdated. Apply latest Supabase migrations.",
    };
  }

  if (
    normalized.includes("relation \"public.user_api_key_audit_events\" does not exist") ||
    normalized.includes("relation \"user_api_key_audit_events\" does not exist")
  ) {
    return {
      status: 500,
      message: "BYOK audit schema is missing. Apply latest Supabase migrations.",
    };
  }

  if (
    normalized.includes("violates foreign key constraint") ||
    normalized.includes("profiles_id_fkey")
  ) {
    return {
      status: 500,
      message: "Account provisioning is incomplete. Sign out and sign back in, then retry.",
    };
  }

  if (
    normalized.includes("row-level security") ||
    normalized.includes("permission denied") ||
    normalized.includes("new row violates row-level security policy")
  ) {
    return {
      status: 500,
      message: "BYOK permissions are not configured. Apply latest database policies.",
    };
  }

  return { status: 500, message: "Failed to update BYOK settings." };
};

const ensureProfileAndRole = async ({
  supabase,
  userId,
  email,
}: {
  supabase: SupabaseClient;
  userId: string;
  email?: string | null;
}) => {
  const modern = await supabase.rpc("ensure_profile_and_role", {
    _user_id: userId,
    _email: email ?? null,
  });

  if (!modern.error) return;

  const modernMessage = modern.error.message ?? "";
  const shouldTryLegacy =
    modernMessage.includes("Could not find the function") ||
    modernMessage.includes("PGRST202");

  if (!shouldTryLegacy) {
    throw new Error(modernMessage || "Failed to provision profile.");
  }

  const legacy = await supabase.rpc("ensure_profile_and_role", {
    _user_id: userId,
  });
  if (legacy.error) {
    throw new Error(legacy.error.message || "Failed to provision profile.");
  }
};

const validateOpenRouterKey = async (key: string): Promise<ValidationResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const { referer, title } = getOpenRouterHeaders();
    const response = await fetch(`${getOpenRouterBaseUrl()}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(referer ? { "HTTP-Referer": referer } : {}),
        ...(title ? { "X-Title": title } : {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        message: "OpenRouter key validation failed.",
      };
    }
    return {
      ok: true,
      statusCode: response.status,
      message: null,
    };
  } catch {
    return {
      ok: false,
      statusCode: null,
      message: "OpenRouter validation request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
};

export async function GET(request: Request) {
  try {
    const { user, supabase } = await requireRequestUser(request);
    await ensureProfileAndRole({
      supabase,
      userId: user.id,
      email: user.email,
    });
    let status = await getByokStatus(supabase, user.id, "openrouter");

    if (status.hasStoredKey && status.needsRevalidation) {
      const persistedKey = await getEffectiveOpenRouterKey({
        supabase,
        userId: user.id,
      });
      if (persistedKey) {
        const validation = await validateOpenRouterKey(persistedKey);
        await updateByokValidationState({
          supabase,
          userId: user.id,
          provider: "openrouter",
          status: validation.ok ? "success" : "failed",
          errorMessage: validation.ok ? null : validation.message,
        });
        await recordAuditEvent({
          supabase,
          request,
          userId: user.id,
          action: "status_check",
          success: validation.ok,
          statusCode: validation.statusCode,
          errorCode: validation.ok ? null : "VALIDATION_FAILED",
        });
        status = await getByokStatus(supabase, user.id, "openrouter");
      }
    }

    return jsonNoStore(status);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    const classified = classifyServerError(error);
    return jsonNoStore({ error: classified.message }, { status: classified.status });
  }
}

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) {
      return forbidden("Invalid request origin for BYOK update.");
    }

    const { user, supabase } = await requireRequestUser(request);
    const identity = resolveRequestIdentity(request, user.id);
    const userLimit = await enforceRateLimit({
      scope: "user",
      identifier: `${identity.userKey}:byok-update`,
      limit: 8,
      windowSec: 60,
    });
    if (!userLimit.allowed) {
      return tooManyRequests(userLimit.retryAfterSec);
    }

    const ipLimit = await enforceRateLimit({
      scope: "ip",
      identifier: `${identity.ipKey}:byok-update`,
      limit: 30,
      windowSec: 60,
    });
    if (!ipLimit.allowed) {
      return tooManyRequests(ipLimit.retryAfterSec);
    }

    await ensureProfileAndRole({
      supabase,
      userId: user.id,
      email: user.email,
    });

    const payload = updateSchema.parse(await request.json());
    const normalizedKey = payload.key.trim();
    const validation = await validateOpenRouterKey(normalizedKey);
    await recordAuditEvent({
      supabase,
      request,
      userId: user.id,
      action: "validate",
      success: validation.ok,
      statusCode: validation.statusCode,
      errorCode: validation.ok ? null : "VALIDATION_FAILED",
    });
    if (!validation.ok) {
      return jsonNoStore(
        { error: validation.message ?? "OpenRouter key validation failed." },
        { status: 400 }
      );
    }

    const status = await saveByokKey({
      supabase,
      userId: user.id,
      provider: payload.provider,
      plainKey: normalizedKey,
    });

    await recordAuditEvent({
      supabase,
      request,
      userId: user.id,
      action: "save",
      success: true,
      statusCode: 200,
      metadata: {
        keyLast4: status.keyLast4,
      },
    });

    return jsonNoStore(status);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof z.ZodError) {
      return jsonNoStore(
        { error: "Invalid BYOK payload." },
        { status: 400 }
      );
    }
    const classified = classifyServerError(error);
    return jsonNoStore({ error: classified.message }, { status: classified.status });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) {
      return forbidden("Invalid request origin for BYOK removal.");
    }

    const { user, supabase } = await requireRequestUser(request);
    await ensureProfileAndRole({
      supabase,
      userId: user.id,
      email: user.email,
    });
    await removeByokKey({ supabase, userId: user.id, provider: "openrouter" });
    await recordAuditEvent({
      supabase,
      request,
      userId: user.id,
      action: "remove",
      success: true,
      statusCode: 200,
    });
    return jsonNoStore({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    const classified = classifyServerError(error);
    return jsonNoStore({ error: classified.message }, { status: classified.status });
  }
}
