import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "@/lib/auth-token";
import type { ThreadNode, ThreadResponse, ThreadSort } from "@/lib/thread/types";

type ThreadFilters = {
  conversationId: string | null;
  roundId?: string | null;
  agentId?: string | null;
  sort: ThreadSort;
  limit?: number;
};

const sanitizeParam = (value: string | null | undefined) => {
  if (!value || value === "all") return null;
  return value;
};

const buildThreadUrl = ({
  conversationId,
  roundId,
  agentId,
  sort,
  limit,
  cursor,
}: ThreadFilters & { cursor?: string | null }) => {
  const params = new URLSearchParams();
  if (conversationId) params.set("conversationId", conversationId);
  const encodedRound = sanitizeParam(roundId);
  if (encodedRound) params.set("round", encodedRound);
  const encodedAgent = sanitizeParam(agentId);
  if (encodedAgent) params.set("agent", encodedAgent);
  params.set("sort", sort);
  params.set("limit", String(limit ?? 160));
  if (cursor) params.set("cursor", cursor);
  return `/api/thread?${params.toString()}`;
};

export const useThread = (filters: ThreadFilters) => {
  return useInfiniteQuery({
    queryKey: [
      "thread",
      filters.conversationId,
      filters.roundId ?? "all",
      filters.agentId ?? "all",
      filters.sort,
      filters.limit ?? 160,
    ],
    enabled: Boolean(filters.conversationId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!filters.conversationId) {
        return null;
      }
      const response = await authedFetch(
        buildThreadUrl({
          ...filters,
          cursor: pageParam,
        }),
        {
          method: "GET",
          cache: "no-store",
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Failed to load thread.");
      }
      return (await response.json()) as ThreadResponse;
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage?.page?.hasMore) return undefined;
      return lastPage.page.nextCursor ?? undefined;
    },
    staleTime: 10_000,
    gcTime: 60_000,
  });
};

const getThreadErrorMessage = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error ?? "Request failed.";
};

export const streamAgentGeneration = async ({
  conversationId,
  roundId,
  selectedAvatar,
  modelId,
  messages,
  idempotencyKey,
  signal,
  onDelta,
}: {
  conversationId: string;
  roundId?: string | null;
  selectedAvatar: string;
  modelId: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  idempotencyKey?: string;
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
}): Promise<{
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  latencyMs: number | null;
}> => {
  const response = await authedFetch("/api/ai/generate-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      conversationId,
      roundId: roundId ?? undefined,
      selectedAvatar,
      modelId,
      messages,
      idempotencyKey,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await getThreadErrorMessage(response));
  }

  if (!response.body) {
    throw new Error("Streaming response body is unavailable.");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let currentEvent: string | null = null;
  let content = "";
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
  let latencyMs: number | null = null;

  const handleLine = (rawLine: string) => {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      currentEvent = null;
      return;
    }

    if (line.startsWith("event:")) {
      currentEvent = line.slice("event:".length).trim();
      return;
    }

    if (!line.startsWith("data:")) {
      return;
    }

    const rawData = line.slice("data:".length).trim();
    if (!rawData) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }

    if (currentEvent === "delta") {
      const chunk =
        typeof (payload as { chunk?: unknown }).chunk === "string"
          ? (payload as { chunk: string }).chunk
          : "";
      if (chunk) {
        content += chunk;
        onDelta(chunk);
      }
      return;
    }

    if (currentEvent === "done") {
      const donePayload = payload as {
        content?: string;
        usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
        latencyMs?: number;
      };
      if (typeof donePayload.content === "string" && donePayload.content.length > 0) {
        content = donePayload.content;
      }
      if (donePayload.usage) {
        usage = {
          promptTokens: Number(donePayload.usage.promptTokens ?? 0),
          completionTokens: Number(donePayload.usage.completionTokens ?? 0),
          totalTokens: Number(donePayload.usage.totalTokens ?? 0),
        };
      }
      if (typeof donePayload.latencyMs === "number") {
        latencyMs = donePayload.latencyMs;
      }
      return;
    }

    if (currentEvent === "error") {
      const message =
        typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "Streaming generation failed.";
      throw new Error(message);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      handleLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.trim().length > 0) {
    handleLine(buffer);
  }

  if (!content.trim()) {
    throw new Error("Model returned an empty streamed response.");
  }

  return { content, usage, latencyMs };
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
      idempotencyKey,
    }: {
      conversationId: string;
      messageId: string;
      highlighted: boolean;
      idempotencyKey?: string;
    }) => {
      const response = await authedFetch("/api/thread/highlight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idempotencyKey
            ? { "x-idempotency-key": idempotencyKey }
            : {}),
        },
        body: JSON.stringify({
          conversationId,
          messageId,
          highlighted,
          idempotencyKey,
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
