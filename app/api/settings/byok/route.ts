import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getByokStatus, removeByokKey, saveByokKey } from "@/lib/server/byok";
import { getOpenRouterBaseUrl, getOpenRouterHeaders } from "@/lib/server/env";
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
    .regex(/^\S+$/, "OpenRouter key must not contain whitespace")
    .optional(),
  storeKey: z.boolean(),
});

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

const validateOpenRouterKey = async (key: string): Promise<boolean> => {
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
    return response.ok;
  } catch {
    return false;
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
    const status = await getByokStatus(supabase, user.id, "openrouter");
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
    const normalizedKey = payload.key?.trim();
    const existing = await getByokStatus(supabase, user.id, payload.provider);

    if (payload.storeKey && !normalizedKey && !existing.hasStoredKey) {
      return jsonNoStore(
        { error: "Provide an OpenRouter key before enabling storage." },
        { status: 400 }
      );
    }

    if (normalizedKey) {
      const isValid = await validateOpenRouterKey(normalizedKey);
      if (!isValid) {
        return jsonNoStore(
          { error: "OpenRouter key validation failed." },
          { status: 400 }
        );
      }
    }

    const status = await saveByokKey({
      supabase,
      userId: user.id,
      provider: payload.provider,
      plainKey: normalizedKey,
      storeKey: payload.storeKey,
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
    const { user, supabase } = await requireRequestUser(request);
    await ensureProfileAndRole({
      supabase,
      userId: user.id,
      email: user.email,
    });
    await removeByokKey({ supabase, userId: user.id, provider: "openrouter" });
    return jsonNoStore({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    const classified = classifyServerError(error);
    return jsonNoStore({ error: classified.message }, { status: classified.status });
  }
}
