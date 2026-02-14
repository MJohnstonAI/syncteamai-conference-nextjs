import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Group {
  id: string;
  name: string;
  is_preset: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useGroups() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["groups", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      // Fetch preset groups and user's own groups
      const { data, error } = await supabase
        .from("groups")
        .select("*")
        .order("is_preset", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as Group[];
    },
  });
}
