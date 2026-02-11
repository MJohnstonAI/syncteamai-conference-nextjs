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

export interface ConversationsPageResult {
  conversations: Conversation[];
  totalCount: number;
  page: number;
  pageSize: number;
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

export const useConversationsPage = ({
  page = 1,
  pageSize = 12,
  searchQuery = "",
}: {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
}) => {
  const { user } = useAuth();

  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const normalizedSearch = searchQuery.trim();

  return useQuery({
    queryKey: ["conversations-page", user?.id, safePage, safePageSize, normalizedSearch],
    queryFn: async () => {
      const from = (safePage - 1) * safePageSize;
      const to = from + safePageSize - 1;

      let query = supabase
        .from("conversations")
        .select("*", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (normalizedSearch) {
        query = query.ilike("title", `%${normalizedSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        conversations: (data ?? []) as Conversation[],
        totalCount: count ?? 0,
        page: safePage,
        pageSize: safePageSize,
      } as ConversationsPageResult;
    },
    enabled: !!user,
    staleTime: 60000,
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
      queryClient.invalidateQueries({ queryKey: ["conversations-page"] });
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
      queryClient.invalidateQueries({ queryKey: ["conversations-page"] });
    },
  });
};
