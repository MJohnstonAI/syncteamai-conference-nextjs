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

      const { data, error } = await supabase
        .from("dev_entitlements")
        .select("tier, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      const expiresAt = data?.expires_at ? Date.parse(data.expires_at) : null;
      if (expiresAt && Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        return "pending" as UserRole;
      }
      return (data?.tier ?? "pending") as UserRole;
    },
    enabled: !!user,
  });
}

