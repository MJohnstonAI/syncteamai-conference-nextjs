import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  script: string | null;
  prompt_script_id: string | null;
  created_at: string;
  updated_at: string;
}

export const useConversations = (limit: number = 50) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversations", user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as Conversation[];
    },
    enabled: !!user,
    staleTime: 60000, // Cache for 1 minute to reduce DB load
  });
};

export const useConversation = (conversationId: string | null) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .maybeSingle();

      if (error) throw error;
      return data as Conversation | null;
    },
    enabled: !!user && !!conversationId,
  });
};

export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      title,
      script,
      promptScriptId,
    }: {
      title: string;
      script?: string;
      promptScriptId?: string;
    }) => {
      if (!user) throw new Error("User must be authenticated");

      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          title,
          script,
          prompt_script_id: promptScriptId ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useDeleteConversation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};
