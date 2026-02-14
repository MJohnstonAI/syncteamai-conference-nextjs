import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type UserRole = "pending" | "free" | "paid" | "cancelled" | "admin";

export function useUserRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user_role", user?.id],
    queryFn: async () => {
      if (!user) return undefined as undefined | UserRole;

      const { data: entitlementData, error: entitlementError } = await supabase
        .from("dev_entitlements")
        .select("tier, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (entitlementError) throw entitlementError;

      const expiresAt = entitlementData?.expires_at
        ? Date.parse(entitlementData.expires_at)
        : null;
      const entitlementTier =
        expiresAt && Number.isFinite(expiresAt) && expiresAt <= Date.now()
          ? ("pending" as UserRole)
          : ((entitlementData?.tier ?? "pending") as UserRole);

      if (entitlementTier !== "pending") {
        return entitlementTier;
      }

      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleError) throw roleError;
      return (roleData?.role ?? entitlementTier) as UserRole;
    },
    enabled: !!user,
  });
}

