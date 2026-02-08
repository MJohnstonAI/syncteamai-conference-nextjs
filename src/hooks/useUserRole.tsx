import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type UserRole = "pending" | "free" | "paid" | "cancelled" | "admin";

export function useUserRole() {
  const { user } = useAuth();
  const bypassPaywall = process.env.NEXT_PUBLIC_BYPASS_PAYWALL === "true";

  return useQuery({
    queryKey: ["user_role", user?.id],
    queryFn: async () => {
      if (!user) return undefined as undefined | UserRole;

      // Development shortcut: treat everyone as free/paid-capable when bypass flag is on.
      if (bypassPaywall) {
        return "free" as UserRole;
      }

      // Temporary admin override for owner email
      if (user.email === "marcaj777@gmail.com") {
        return "admin" as UserRole;
      }

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return (data?.role ?? "pending") as UserRole;
    },
    enabled: !!user,
  });
}

