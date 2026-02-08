import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type EntitlementTier = "pending" | "free" | "paid" | "cancelled" | "admin";

type EntitlementRow = {
  tier: EntitlementTier | null;
  expires_at: string | null;
};

const isExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) && parsed <= Date.now();
};

export const getEntitlementTier = async (
  supabase: SupabaseClient,
  userId: string
): Promise<EntitlementTier> => {
  const { data, error } = await supabase
    .from("dev_entitlements")
    .select("tier, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const row = (data as EntitlementRow | null) ?? null;
  if (!row || isExpired(row.expires_at)) {
    return "pending";
  }
  return (row.tier ?? "pending") as EntitlementTier;
};

export const canGenerate = (tier: EntitlementTier): boolean =>
  tier === "free" || tier === "paid" || tier === "admin";
