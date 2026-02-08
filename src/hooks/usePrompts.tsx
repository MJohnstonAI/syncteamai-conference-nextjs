// user_id is the authenticated Supabase user identifier.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";

export interface Prompt {
  id: string;
  title: string;
  description: string | null;
  script: string;
  user_id: string | null;
  group_id: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export function usePrompts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["prompts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("saved_prompts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Prompt[];
    },
  });
}

export function useCreatePrompt() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description: string;
      script: string;
      group_id: string | null;
      is_demo: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("saved_prompts").insert({
        ...data,
        user_id: user.id,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      toast({
        title: "Success",
        description: "Template created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdatePrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      title: string;
      description: string;
      script: string;
      group_id: string | null;
      is_demo: boolean;
    }) => {
      const { id, ...updateData } = data;
      const { error } = await supabase
        .from("saved_prompts")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      toast({
        title: "Success",
        description: "Template updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeletePrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (promptId: string) => {
      const { error } = await supabase
        .from("saved_prompts")
        .delete()
        .eq("id", promptId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompts"] });
      toast({
        title: "Success",
        description: "Template deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
