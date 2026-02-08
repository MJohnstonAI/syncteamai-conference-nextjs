import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "@/lib/auth-token";
import type { ThreadNode, ThreadResponse, ThreadSort } from "@/lib/thread/types";

type ThreadFilters = {
  conversationId: string | null;
  roundId?: string | null;
  agentId?: string | null;
  sort: ThreadSort;
};

const sanitizeParam = (value: string | null | undefined) => {
  if (!value || value === "all") return null;
  return value;
};

const buildThreadUrl = ({ conversationId, roundId, agentId, sort }: ThreadFilters) => {
  const params = new URLSearchParams();
  if (conversationId) params.set("conversationId", conversationId);
  const encodedRound = sanitizeParam(roundId);
  if (encodedRound) params.set("round", encodedRound);
  const encodedAgent = sanitizeParam(agentId);
  if (encodedAgent) params.set("agent", encodedAgent);
  params.set("sort", sort);
  return `/api/thread?${params.toString()}`;
};

export const useThread = (filters: ThreadFilters) => {
  return useQuery({
    queryKey: [
      "thread",
      filters.conversationId,
      filters.roundId ?? "all",
      filters.agentId ?? "all",
      filters.sort,
    ],
    enabled: Boolean(filters.conversationId),
    queryFn: async () => {
      if (!filters.conversationId) {
        return null;
      }
      const response = await authedFetch(buildThreadUrl(filters), {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to load thread.");
      }
      return (await response.json()) as ThreadResponse;
    },
    staleTime: 10_000,
    gcTime: 60_000,
  });
};

type CreateReplyInput = {
  conversationId: string;
  roundId?: string | null;
  parentMessageId?: string | null;
  content: string;
  replyMode?: "human" | "agent";
  avatarId?: string;
  idempotencyKey?: string;
};

export const useCreateThreadReply = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateReplyInput) => {
      const response = await authedFetch("/api/thread/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(input.idempotencyKey
            ? { "x-idempotency-key": input.idempotencyKey }
            : {}),
        },
        body: JSON.stringify(input),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: ThreadNode }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to create reply.");
      }

      return payload;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["thread", variables.conversationId],
      });
    },
  });
};

export const useToggleThreadHighlight = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
      highlighted,
    }: {
      conversationId: string;
      messageId: string;
      highlighted: boolean;
    }) => {
      const response = await authedFetch("/api/thread/highlight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          messageId,
          highlighted,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to update highlight.");
      }

      return payload;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["thread", variables.conversationId],
      });
    },
  });
};
