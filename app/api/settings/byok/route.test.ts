import { beforeEach, describe, expect, it, vi } from "vitest";

const getByokStatusMock = vi.fn();
const saveByokKeyMock = vi.fn();
const removeByokKeyMock = vi.fn();
const requireRequestUserMock = vi.fn();
const resolveRequestIdentityMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const getOpenRouterBaseUrlMock = vi.fn();
const getOpenRouterHeadersMock = vi.fn();
const getByokEncryptionSecretMock = vi.fn();

vi.mock("@/lib/server/byok", () => ({
  getByokStatus: (...args: unknown[]) => getByokStatusMock(...args),
  saveByokKey: (...args: unknown[]) => saveByokKeyMock(...args),
  removeByokKey: (...args: unknown[]) => removeByokKeyMock(...args),
  getEffectiveOpenRouterKey: vi.fn(),
  updateByokValidationState: vi.fn(),
}));

vi.mock("@/lib/server/supabase-server", () => ({
  requireRequestUser: (...args: unknown[]) => requireRequestUserMock(...args),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  resolveRequestIdentity: (...args: unknown[]) => resolveRequestIdentityMock(...args),
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

vi.mock("@/lib/server/env", () => ({
  getOpenRouterBaseUrl: (...args: unknown[]) => getOpenRouterBaseUrlMock(...args),
  getOpenRouterHeaders: (...args: unknown[]) => getOpenRouterHeadersMock(...args),
  getByokEncryptionSecret: (...args: unknown[]) => getByokEncryptionSecretMock(...args),
}));

import { DELETE, POST } from "./route";

describe("BYOK API origin and mutation checks", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    getByokStatusMock.mockReset();
    saveByokKeyMock.mockReset();
    removeByokKeyMock.mockReset();
    requireRequestUserMock.mockReset();
    resolveRequestIdentityMock.mockReset();
    enforceRateLimitMock.mockReset();
    getOpenRouterBaseUrlMock.mockReset();
    getOpenRouterHeadersMock.mockReset();
    getByokEncryptionSecretMock.mockReset();

    const rpc = vi.fn().mockResolvedValue({ error: null });
    requireRequestUserMock.mockResolvedValue({
      user: { id: "user-123", email: "user@example.com" },
      supabase: { rpc, from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })) },
    });
    resolveRequestIdentityMock.mockReturnValue({ userKey: "user-123", ipKey: "127.0.0.1" });
    enforceRateLimitMock.mockResolvedValue({ allowed: true, retryAfterSec: 1 });
    getOpenRouterBaseUrlMock.mockReturnValue("https://openrouter.ai/api/v1");
    getOpenRouterHeadersMock.mockReturnValue({ referer: undefined, title: undefined });
    getByokEncryptionSecretMock.mockReturnValue("test-audit-secret");
    getByokStatusMock.mockResolvedValue({
      provider: "openrouter",
      hasStoredKey: false,
      encryptionKid: null,
      keyLast4: null,
      lastValidatedAt: null,
      lastValidationStatus: "unknown",
      lastValidationError: null,
      needsRevalidation: false,
      updatedAt: null,
      hasDevFallbackKey: false,
      storeKey: false,
    });
    saveByokKeyMock.mockResolvedValue({
      provider: "openrouter",
      hasStoredKey: true,
      encryptionKid: "active-kid",
      keyLast4: "7890",
      lastValidatedAt: "2026-02-14T00:00:00.000Z",
      lastValidationStatus: "success",
      lastValidationError: null,
      needsRevalidation: false,
      updatedAt: "2026-02-14T00:00:00.000Z",
      hasDevFallbackKey: false,
      storeKey: true,
    });
    removeByokKeyMock.mockResolvedValue(undefined);
  });

  it("rejects POST when origin is cross-site", async () => {
    const request = new Request("https://app.example.com/api/settings/byok", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example.com",
      },
      body: JSON.stringify({
        provider: "openrouter",
        key: "sk-or-v1-1234567890",
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { error?: string; code?: string };

    expect(response.status).toBe(403);
    expect(payload.code).toBe("FORBIDDEN_ORIGIN");
    expect(requireRequestUserMock).not.toHaveBeenCalled();
  });

  it("accepts POST when origin matches and saves BYOK", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const request = new Request("https://app.example.com/api/settings/byok", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://app.example.com",
      },
      body: JSON.stringify({
        provider: "openrouter",
        key: "sk-or-v1-1234567890",
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as { hasStoredKey?: boolean; keyLast4?: string };

    expect(response.status).toBe(200);
    expect(payload.hasStoredKey).toBe(true);
    expect(payload.keyLast4).toBe("7890");
    expect(saveByokKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-123",
        provider: "openrouter",
        plainKey: "sk-or-v1-1234567890",
      })
    );
  });

  it("rejects DELETE when referer origin is cross-site", async () => {
    const request = new Request("https://app.example.com/api/settings/byok", {
      method: "DELETE",
      headers: {
        Referer: "https://evil.example.com/pwn",
      },
    });

    const response = await DELETE(request);
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(payload.code).toBe("FORBIDDEN_ORIGIN");
    expect(requireRequestUserMock).not.toHaveBeenCalled();
  });

  it("accepts DELETE when referer origin matches", async () => {
    const request = new Request("https://app.example.com/api/settings/byok", {
      method: "DELETE",
      headers: {
        Referer: "https://app.example.com/auth?step=2",
      },
    });

    const response = await DELETE(request);
    const payload = (await response.json()) as { success?: boolean };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(removeByokKeyMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      userId: "user-123",
      provider: "openrouter",
    });
  });
});
