import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  avatar_id: string | null;
  created_at: string;
}

export const useMessages = (conversationId: string | null, limit: number = 100) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId, limit],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversationId,
    staleTime: 30000, // Cache for 30 seconds to reduce DB load
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          queryClient.setQueryData<Message[]>(
            ["messages", conversationId, limit],
            (old) => [...(old || []), payload.new as Message]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, limit]);

  return query;
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      role,
      content,
      avatarId,
    }: {
      conversationId: string;
      role: "user" | "assistant" | "system";
      content: string;
      avatarId?: string;
    }) => {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role,
          content,
          avatar_id: avatarId || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Message;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["messages", variables.conversationId],
      });
    },
  });
};
