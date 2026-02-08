import { NextResponse } from "next/server";
import { z } from "zod";
import { getByokStatus, removeByokKey, saveByokKey } from "@/lib/server/byok";
import { getOpenRouterBaseUrl, getOpenRouterHeaders } from "@/lib/server/env";
import { requireRequestUser } from "@/lib/server/supabase-server";

export const runtime = "nodejs";

const updateSchema = z.object({
  provider: z.literal("openrouter").default("openrouter"),
  key: z.string().trim().min(10).max(500).optional(),
  storeKey: z.boolean(),
});

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const status = await getByokStatus(supabase, user.id, "openrouter");
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return NextResponse.json(
      { error: "Failed to load key settings." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireRequestUser(request);
    const payload = updateSchema.parse(await request.json());
    const existing = await getByokStatus(supabase, user.id, payload.provider);

    if (payload.storeKey && !payload.key && !existing.hasStoredKey) {
      return NextResponse.json(
        { error: "Provide an OpenRouter key before enabling storage." },
        { status: 400 }
      );
    }

    if (payload.key) {
      const isValid = await validateOpenRouterKey(payload.key);
      if (!isValid) {
        return NextResponse.json(
          { error: "OpenRouter key validation failed." },
          { status: 400 }
        );
      }
    }

    const status = await saveByokKey({
      supabase,
      userId: user.id,
      provider: payload.provider,
      plainKey: payload.key,
      storeKey: payload.storeKey,
    });

    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid BYOK payload." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update BYOK settings." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, supabase } = await requireRequestUser(request);
    await removeByokKey({ supabase, userId: user.id, provider: "openrouter" });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return NextResponse.json({ error: "Failed to remove key." }, { status: 500 });
  }
}
