import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModelSelectionDropdown } from "@/components/ModelSelectionDropdown";
import { ThreadShell } from "@/components/thread/ThreadShell";
import { RootPostCard } from "@/components/thread/RootPostCard";
import { ThreadList } from "@/components/thread/ThreadList";
import { ThreadComposer } from "@/components/thread/ThreadComposer";
import { SortFilterBar } from "@/components/thread/SortFilterBar";
import { ThreadSkeleton } from "@/components/thread/ThreadSkeleton";
import { ThreadEmptyState } from "@/components/thread/ThreadEmptyState";
import { AgentMiniCard } from "@/components/thread/AgentMiniCard";
import { RoundPill } from "@/components/thread/RoundPill";
import { ActionRail } from "@/components/ActionRail";
import { ConversationHistory } from "@/components/ConversationHistory";
import { useAuth } from "@/hooks/useAuth";
import { useCreateConversation } from "@/hooks/useConversations";
import {
  streamAgentGeneration,
  useCreateThreadReply,
  useThread,
  useToggleThreadHighlight,
} from "@/hooks/useThread";
import { useMessages } from "@/hooks/useMessages";
import { useUserRole } from "@/hooks/useUserRole";
import { useBYOK } from "@/hooks/useBYOK";
import { useToast } from "@/hooks/use-toast";
import { getAgentMeta } from "@/lib/agents";
import type { ThreadSort } from "@/lib/thread/types";
import { ArrowRight, Key, Loader2, Sparkles, Square } from "lucide-react";

type TranscriptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type AgentRunStatus = "queued" | "generating" | "completed" | "failed" | "cancelled";

type AgentRunState = {
  status: AgentRunStatus;
  modelId: string | null;
  preview: string;
  error: string | null;
};

type NextStepState =
  | "session_booting"
  | "pending_run"
  | "partial_failure"
  | "no_byok"
  | "no_active_models"
  | "idle";

const Conference = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
  const {
    openRouterKey,
    hasConfiguredOpenRouterKey,
    selectedModels,
    activeModels,
    avatarOrder,
    getModelForAvatar,
    setSelectedModels,
  } = useBYOK();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<ThreadSort>("new");
  const [roundFilter, setRoundFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [rootDraft, setRootDraft] = useState("");
  const [pendingParentId, setPendingParentId] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [agentRunStates, setAgentRunStates] = useState<Record<string, AgentRunState>>({});
  const [failedAgentIds, setFailedAgentIds] = useState<string[]>([]);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [modelSelectionOpenSignal, setModelSelectionOpenSignal] = useState(0);

  const hasCreatedConversation = useRef(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const roundTranscriptRef = useRef<TranscriptMessage[]>([]);
  const roundMessageIdRef = useRef<string | null>(null);
  const rootComposerRef = useRef<HTMLDivElement | null>(null);

  const title = searchParams.get("title") || "Conference";
  const script = searchParams.get("script") || "";
  const promptScriptId = searchParams.get("prompt_id");
  const linkedMessageId = searchParams.get("msg");

  const effectiveRole = userRole ?? "pending";
  const isAdminRole = effectiveRole === "admin";
  const isPaidRole = effectiveRole === "paid";
  const isFreeRole = effectiveRole === "free";
  const hasPrivilegedAccess = isAdminRole || isPaidRole || isFreeRole;

  const createConversation = useCreateConversation();
  const createReply = useCreateThreadReply();
  const toggleHighlight = useToggleThreadHighlight();

  const {
    data: threadPagesData,
    isLoading: threadLoading,
    error: threadError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useThread({
    conversationId,
    roundId: roundFilter,
    agentId: agentFilter,
    sort: sortMode,
    limit: 140,
  });
  const threadPages = useMemo(
    () => threadPagesData?.pages.filter((page): page is NonNullable<typeof page> => Boolean(page)) ?? [],
    [threadPagesData?.pages]
  );
  const firstThreadPage = threadPages[0] ?? null;
  const threadNodes = useMemo(() => threadPages.flatMap((page) => page.nodes), [threadPages]);
  const { data: messages = [] } = useMessages(conversationId, 500);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (hasCreatedConversation.current) return;

    if (!loading && user && !conversationId && title && !searchParams.get("conversation_id")) {
      hasCreatedConversation.current = true;

      createConversation.mutate(
        {
          title,
          script: script || undefined,
          promptScriptId: promptScriptId || undefined,
        },
        {
          onSuccess: (data) => {
            setConversationId(data.id);
            navigate(`/conference?conversation_id=${data.id}`, { replace: true });
          },
          onError: (error) => {
            hasCreatedConversation.current = false;
            const message = error instanceof Error ? error.message : "Failed to create conversation.";
            toast({
              title: "Error",
              description: message,
              variant: "destructive",
            });
          },
        }
      );
    }
  }, [
    conversationId,
    createConversation,
    loading,
    navigate,
    promptScriptId,
    script,
    searchParams,
    title,
    toast,
    user,
  ]);

  useEffect(() => {
    const conversationIdFromUrl = searchParams.get("conversation_id");
    if (conversationIdFromUrl && conversationIdFromUrl !== conversationId) {
      setConversationId(conversationIdFromUrl);
    }
  }, [conversationId, searchParams]);

  useEffect(() => {
    setRoundFilter("all");
    setAgentFilter("all");
    setCollapsedIds(new Set());
    setReplyingToId(null);
    setReplyDrafts({});
    setRootDraft("");
    setAgentRunStates({});
    setFailedAgentIds([]);
    setActiveRoundId(null);
    roundTranscriptRef.current = [];
    roundMessageIdRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    return () => {
      hasCreatedConversation.current = false;
      generationAbortRef.current?.abort();
    };
  }, []);

  const roundLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const round of firstThreadPage?.rounds ?? []) {
      map[round.id] = round.label;
    }
    return map;
  }, [firstThreadPage?.rounds]);

  const activeAvatarIds = useMemo(() => {
    return avatarOrder.filter((avatarId) => {
      const modelId = getModelForAvatar(avatarId);
      return Boolean(modelId && activeModels.includes(modelId));
    });
  }, [activeModels, avatarOrder, getModelForAvatar]);

  useEffect(() => {
    if (!threadNodes.length) {
      setSelectedMessageId(null);
      return;
    }

    if (!selectedMessageId || !threadNodes.some((node) => node.id === selectedMessageId)) {
      setSelectedMessageId(threadNodes[0].id);
    }
  }, [selectedMessageId, threadNodes]);

  useEffect(() => {
    if (!threadNodes.length || !linkedMessageId) return;
    const exists = threadNodes.some((node) => node.id === linkedMessageId);
    if (!exists) return;

    setSelectedMessageId(linkedMessageId);
    setLinkTargetId(linkedMessageId);

    const rafId = requestAnimationFrame(() => {
      document.getElementById(`message-${linkedMessageId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });

    const timer = window.setTimeout(() => {
      setLinkTargetId((current) => (current === linkedMessageId ? null : current));
    }, 2600);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timer);
    };
  }, [linkedMessageId, threadNodes]);

  useEffect(() => {
    if (!threadNodes.length) {
      if (collapsedIds.size > 0) {
        setCollapsedIds(new Set());
      }
      return;
    }

    const nodeIdSet = new Set(threadNodes.map((node) => node.id));
    const next = new Set<string>();
    collapsedIds.forEach((id) => {
      if (nodeIdSet.has(id)) next.add(id);
    });

    if (next.size !== collapsedIds.size) {
      setCollapsedIds(next);
    }
  }, [collapsedIds, threadNodes]);

  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return null;
    return threadNodes.find((node) => node.id === selectedMessageId) ?? null;
  }, [selectedMessageId, threadNodes]);

  const hasChildrenMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of threadNodes) {
      if (!node.parentMessageId) continue;
      map.set(node.parentMessageId, (map.get(node.parentMessageId) ?? 0) + 1);
    }
    return map;
  }, [threadNodes]);

  const handleToggleCollapse = useCallback((messageId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const copyMessageLink = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;

      const params = new URLSearchParams(searchParams.toString());
      params.set("conversation_id", conversationId);
      params.set("msg", messageId);

      const targetPath = `/conference?${params.toString()}`;
      navigate(targetPath, { replace: true, scroll: false });

      try {
        const url = new URL(window.location.href);
        url.search = params.toString();
        await navigator.clipboard.writeText(url.toString());
        toast({
          title: "Link copied",
          description: "Direct link to this message copied to clipboard.",
        });
      } catch {
        toast({
          title: "Copy failed",
          description: "Unable to copy message link.",
          variant: "destructive",
        });
      }
    },
    [conversationId, navigate, searchParams, toast]
  );

  const createUserReply = useCallback(
    async ({
      parentMessageId,
      content,
    }: {
      parentMessageId: string | null;
      content: string;
    }) => {
      if (!conversationId) {
        throw new Error("Conversation is not ready.");
      }

      const payload = await createReply.mutateAsync({
        conversationId,
        parentMessageId,
        content,
        replyMode: "human",
      });

      const message = payload?.message;
      if (!message) {
        throw new Error("Reply was created but no message payload was returned.");
      }
      return message;
    },
    [conversationId, createReply]
  );

  const buildTranscriptFromMessages = useCallback((): TranscriptMessage[] => {
    return [...messages]
      .sort((a, b) => {
        const leftKey = a.sort_key ?? "";
        const rightKey = b.sort_key ?? "";
        if (leftKey && rightKey && leftKey !== rightKey) {
          return leftKey.localeCompare(rightKey);
        }
        return a.created_at.localeCompare(b.created_at);
      })
      .map((item) => ({
        role: item.role as "user" | "assistant" | "system",
        content: item.content,
      }));
  }, [messages]);

  const setAgentState = useCallback(
    (avatarId: string, updates: Partial<AgentRunState>) => {
      setAgentRunStates((previous) => {
        const existing: AgentRunState = previous[avatarId] ?? {
          status: "queued",
          modelId: getModelForAvatar(avatarId) ?? null,
          preview: "",
          error: null,
        };
        return {
          ...previous,
          [avatarId]: {
            ...existing,
            ...updates,
          },
        };
      });
    },
    [getModelForAvatar]
  );

  const cancelAgentGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
  }, []);

  const runAgentBatch = useCallback(
    async ({
      userMessageId,
      avatarIds,
      transcriptSeed,
    }: {
      userMessageId: string;
      avatarIds: string[];
      transcriptSeed: TranscriptMessage[];
    }): Promise<{ failed: string[]; cancelled: boolean }> => {
      if (!conversationId) {
        return { failed: avatarIds, cancelled: false };
      }

      const abortController = new AbortController();
      generationAbortRef.current = abortController;
      setIsAiThinking(true);

      const transcript = [...transcriptSeed];
      const failed: string[] = [];
      let cancelled = false;

      try {
        for (const avatarId of avatarIds) {
          if (abortController.signal.aborted) {
            cancelled = true;
            break;
          }

          const modelId = getModelForAvatar(avatarId);
          if (!modelId) {
            failed.push(avatarId);
            setAgentState(avatarId, {
              status: "failed",
              error: "No model selected for this agent.",
            });
            continue;
          }

          setAgentState(avatarId, {
            status: "generating",
            modelId,
            error: null,
            preview: "",
          });

          let livePreview = "";

          try {
            const idempotencyKey = `${conversationId}:${userMessageId}:${avatarId}:${modelId}:${Date.now()}`;
            const result = await streamAgentGeneration({
              conversationId,
              roundId: userMessageId,
              selectedAvatar: avatarId,
              modelId,
              messages: transcript,
              openRouterKey: openRouterKey ?? undefined,
              idempotencyKey,
              signal: abortController.signal,
              onDelta: (chunk) => {
                livePreview += chunk;
                setAgentState(avatarId, {
                  preview: livePreview.slice(-1000),
                });
              },
            });

            const aiContent = (result.content || livePreview).trim();
            if (!aiContent) {
              throw new Error("Model returned an empty response.");
            }

            await createReply.mutateAsync({
              conversationId,
              roundId: userMessageId,
              parentMessageId: userMessageId,
              content: aiContent,
              replyMode: "agent",
              avatarId,
              idempotencyKey: `${idempotencyKey}:persist`,
            });

            transcript.push({ role: "assistant", content: aiContent });
            roundTranscriptRef.current = transcript;

            setAgentState(avatarId, {
              status: "completed",
              preview: aiContent.slice(0, 1000),
              error: null,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Agent generation failed.";
            const isCancelledError =
              abortController.signal.aborted ||
              errorMessage.toLowerCase().includes("cancelled");

            if (isCancelledError) {
              cancelled = true;
              setAgentState(avatarId, {
                status: "cancelled",
                error: "Generation cancelled.",
              });
              break;
            }

            failed.push(avatarId);
            setAgentState(avatarId, {
              status: "failed",
              error: errorMessage,
            });
          }
        }

        if (cancelled) {
          setAgentRunStates((previous) => {
            const next = { ...previous };
            for (const avatarId of avatarIds) {
              const state = next[avatarId];
              if (!state || state.status === "queued" || state.status === "generating") {
                next[avatarId] = {
                  status: "cancelled",
                  modelId: state?.modelId ?? getModelForAvatar(avatarId) ?? null,
                  preview: state?.preview ?? "",
                  error: "Generation cancelled.",
                };
              }
            }
            return next;
          });
        }

        return { failed, cancelled };
      } finally {
        setIsAiThinking(false);
        generationAbortRef.current = null;
      }
    },
    [
      conversationId,
      createReply,
      getModelForAvatar,
      openRouterKey,
      setAgentState,
    ]
  );

  const retryFailedAgent = useCallback(
    async (avatarId: string) => {
      if (isAiThinking) return;
      if (!conversationId || !roundMessageIdRef.current) {
        toast({
          title: "Retry unavailable",
          description: "No partial round found to recover.",
          variant: "destructive",
        });
        return;
      }

      const transcript = [...roundTranscriptRef.current];
      const result = await runAgentBatch({
        userMessageId: roundMessageIdRef.current,
        avatarIds: [avatarId],
        transcriptSeed: transcript,
      });

      if (result.cancelled) {
        toast({
          title: "Generation cancelled",
          description: "Agent retry was cancelled.",
        });
      }

      setFailedAgentIds((previous) => {
        const withoutCurrent = previous.filter((id) => id !== avatarId);
        if (result.failed.includes(avatarId)) {
          return withoutCurrent.includes(avatarId)
            ? withoutCurrent
            : [...withoutCurrent, avatarId];
        }
        return withoutCurrent;
      });
    },
    [conversationId, isAiThinking, runAgentBatch, toast]
  );

  const retryAllFailedAgents = useCallback(async () => {
    if (isAiThinking || failedAgentIds.length === 0) return;
    if (!roundMessageIdRef.current) return;

    const transcript = [...roundTranscriptRef.current];
    const result = await runAgentBatch({
      userMessageId: roundMessageIdRef.current,
      avatarIds: failedAgentIds,
      transcriptSeed: transcript,
    });
    setFailedAgentIds(result.failed);
  }, [failedAgentIds, isAiThinking, runAgentBatch]);

  const submitReply = useCallback(
    async ({
      parentMessageId,
      content,
      clear,
    }: {
      parentMessageId: string | null;
      content: string;
      clear: () => void;
    }) => {
      const trimmed = content.trim();
      if (!trimmed || !conversationId || pendingParentId || isAiThinking) {
        return;
      }

      const pendingKey = parentMessageId ?? "root";
      setPendingParentId(pendingKey);
      clear();

      try {
        const userMessage = await createUserReply({
          parentMessageId,
          content: trimmed,
        });

        setSelectedMessageId(userMessage.id);
        setReplyingToId(null);

        if (!hasConfiguredOpenRouterKey || !hasPrivilegedAccess) {
          toast({
            title: "BYOK Required",
            description: "Add your OpenRouter API key in Settings to continue.",
            variant: "destructive",
          });
          return;
        }

        if (activeAvatarIds.length === 0) {
          toast({
            title: "No active models",
            description: "Select at least one model to generate agent responses.",
            variant: "destructive",
          });
          return;
        }

        const transcript = buildTranscriptFromMessages();
        const hasUserMessage = messages.some((item) => item.id === userMessage.id);
        if (!hasUserMessage) {
          transcript.push({
            role: "user",
            content: userMessage.content,
          });
        }

        roundTranscriptRef.current = transcript;
        roundMessageIdRef.current = userMessage.id;
        setActiveRoundId(userMessage.id);
        setFailedAgentIds([]);

        const initialStates: Record<string, AgentRunState> = {};
        for (const avatarId of activeAvatarIds) {
          initialStates[avatarId] = {
            status: "queued",
            modelId: getModelForAvatar(avatarId) ?? null,
            preview: "",
            error: null,
          };
        }
        setAgentRunStates(initialStates);

        const result = await runAgentBatch({
          userMessageId: userMessage.id,
          avatarIds: activeAvatarIds,
          transcriptSeed: transcript,
        });
        setFailedAgentIds(result.failed);
        if (result.cancelled) {
          toast({
            title: "Generation cancelled",
            description: "The round was cancelled before all agents completed.",
          });
        } else if (result.failed.length > 0) {
          toast({
            title: "Partial round failure",
            description: `${result.failed.length} agent response(s) failed. Use retry to recover.`,
            variant: "destructive",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send reply.";
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      } finally {
        setPendingParentId(null);
      }
    },
    [
      activeAvatarIds,
      buildTranscriptFromMessages,
      conversationId,
      createUserReply,
      getModelForAvatar,
      hasConfiguredOpenRouterKey,
      hasPrivilegedAccess,
      isAiThinking,
      messages,
      pendingParentId,
      runAgentBatch,
      toast,
    ]
  );

  const handleSelectConversation = useCallback(
    (nextConversationId: string) => {
      setConversationId(nextConversationId);
      setSelectedMessageId(null);
      navigate(`/conference?conversation_id=${nextConversationId}`, {
        replace: true,
      });
    },
    [navigate]
  );

  const handleNewConversation = useCallback(() => {
    setConversationId(null);
    setSelectedMessageId(null);
    navigate("/conference");
  }, [navigate]);

  const conferenceReturnPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `/conference?${query}` : "/conference";
  }, [searchParams]);

  const navigateToSettingsForByok = useCallback(
    (entry: "next_step" | "sidebar" | "alert") => {
      const params = new URLSearchParams({
        source: "conference",
        focus: "byok",
        entry,
        return_to: conferenceReturnPath,
      });
      navigate(`/settings?${params.toString()}`);
    },
    [conferenceReturnPath, navigate]
  );

  const focusRootComposer = useCallback(() => {
    const textarea = rootComposerRef.current?.querySelector("textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const openModelSelection = useCallback(() => {
    setModelSelectionOpenSignal((previous) => previous + 1);
  }, []);

  const nextStepState = useMemo<NextStepState>(() => {
    if (!conversationId) return "session_booting";
    if (isAiThinking || pendingParentId !== null) return "pending_run";
    if (failedAgentIds.length > 0) return "partial_failure";
    if (!hasPrivilegedAccess || !hasConfiguredOpenRouterKey) return "no_byok";
    if (activeAvatarIds.length === 0) return "no_active_models";
    return "idle";
  }, [
    activeAvatarIds.length,
    conversationId,
    failedAgentIds.length,
    hasConfiguredOpenRouterKey,
    hasPrivilegedAccess,
    isAiThinking,
    pendingParentId,
  ]);

  const nextStepMeta = useMemo(() => {
    switch (nextStepState) {
      case "session_booting":
        return {
          badgeVariant: "outline" as const,
          badgeLabel: "Preparing",
          title: "Setting up your conference session",
          description: "We are loading the conversation context and controls.",
          actionLabel: "Please wait",
          actionVariant: "outline" as const,
          actionDisabled: true,
        };
      case "pending_run":
        return {
          badgeVariant: "secondary" as const,
          badgeLabel: "In Progress",
          title: isAiThinking ? "Agents are running this round" : "Posting your message",
          description: isAiThinking
            ? "Wait for completion or stop now if you need to change direction."
            : "Your prompt is being posted to the thread.",
          actionLabel: isAiThinking ? "Stop run" : "Sending...",
          actionVariant: "outline" as const,
          actionDisabled: !isAiThinking,
        };
      case "partial_failure":
        return {
          badgeVariant: "destructive" as const,
          badgeLabel: "Recovery",
          title: "Recover failed agent responses",
          description: `${failedAgentIds.length} agent response(s) failed in the active round.`,
          actionLabel: "Retry failed agents",
          actionVariant: "default" as const,
          actionDisabled: false,
        };
      case "no_byok":
        return {
          badgeVariant: "outline" as const,
          badgeLabel: "Access",
          title: hasPrivilegedAccess ? "Configure BYOK before running agents" : "Unlock model access first",
          description: hasPrivilegedAccess
            ? "Add your OpenRouter key so the conference can generate agent replies."
            : "Your role is pending. Upgrade to enable model configuration and agent runs.",
          actionLabel: hasPrivilegedAccess ? "Configure BYOK" : "Open subscription",
          actionVariant: "default" as const,
          actionDisabled: false,
        };
      case "no_active_models":
        return {
          badgeVariant: "outline" as const,
          badgeLabel: "Setup",
          title: "Pick active models for this round",
          description: "Select at least one active model to receive agent replies.",
          actionLabel: "Pick models",
          actionVariant: "default" as const,
          actionDisabled: false,
        };
      case "idle":
      default:
        return {
          badgeVariant: "secondary" as const,
          badgeLabel: "Ready",
          title: threadNodes.length === 0 ? "Send your first prompt" : "Drive the next step",
          description:
            threadNodes.length === 0
              ? "Ask the team to begin so each active agent can respond in sequence."
              : "Post the next instruction or argument to continue the debate.",
          actionLabel: threadNodes.length === 0 ? "Send first prompt" : "Compose next prompt",
          actionVariant: "default" as const,
          actionDisabled: false,
        };
    }
  }, [failedAgentIds.length, hasPrivilegedAccess, isAiThinking, nextStepState, threadNodes.length]);

  const handleNextStepPrimaryAction = useCallback(() => {
    switch (nextStepState) {
      case "pending_run":
        if (isAiThinking) {
          cancelAgentGeneration();
        }
        return;
      case "partial_failure":
        void retryAllFailedAgents();
        return;
      case "no_byok":
        if (hasPrivilegedAccess) {
          navigateToSettingsForByok("next_step");
        } else {
          navigate("/subscribe");
        }
        return;
      case "no_active_models":
        openModelSelection();
        return;
      case "idle":
        focusRootComposer();
        return;
      case "session_booting":
      default:
        return;
    }
  }, [
    cancelAgentGeneration,
    focusRootComposer,
    hasPrivilegedAccess,
    isAiThinking,
    navigate,
    navigateToSettingsForByok,
    nextStepState,
    openModelSelection,
    retryAllFailedAgents,
  ]);

  const priorityCard = (
    <section className="mx-auto w-full max-w-4xl rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">What Next</p>
            <Badge variant={nextStepMeta.badgeVariant}>{nextStepMeta.badgeLabel}</Badge>
          </div>
          <h2 className="text-sm font-semibold">{nextStepMeta.title}</h2>
          <p className="text-xs text-muted-foreground">{nextStepMeta.description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={nextStepMeta.actionVariant}
          onClick={handleNextStepPrimaryAction}
          disabled={nextStepMeta.actionDisabled}
          className="sm:min-w-44"
        >
          {nextStepMeta.actionLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );

  const leftSidebar = (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Conference</p>
        <h2 className="mt-1 text-lg font-semibold leading-tight">
          {firstThreadPage?.rootPost.title ?? title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{effectiveRole}</Badge>
          {hasConfiguredOpenRouterKey ? (
            <Badge variant="secondary" className="gap-1">
              <Key className="h-3 w-3" /> BYOK
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={handleNewConversation}
        >
          New Conference
        </Button>
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold">Session Vault</h3>
        <ConversationHistory
          embedded
          hideNewButton
          limit={25}
          currentConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          className="max-h-[280px]"
        />
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sort & Filters</h3>
        </div>
        <SortFilterBar
          sort={sortMode}
          onSortChange={setSortMode}
          roundFilter={roundFilter}
          onRoundFilterChange={setRoundFilter}
          agentFilter={agentFilter}
          onAgentFilterChange={setAgentFilter}
          rounds={firstThreadPage?.rounds ?? []}
          agents={firstThreadPage?.agents ?? []}
        />
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold">Agents in Order</h3>
        {activeAvatarIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">Activate at least one model to receive agent replies.</p>
        ) : (
          <div className="space-y-2">
            {activeAvatarIds.map((avatarId, index) => {
              const modelId = getModelForAvatar(avatarId);
              const agent = getAgentMeta(avatarId);
              const state = agentRunStates[avatarId];
              const statusLabel = state?.status ? state.status.replace("_", " ") : "idle";
              const statusClass =
                state?.status === "completed"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : state?.status === "failed"
                  ? "bg-destructive/10 text-destructive border-destructive/20"
                  : state?.status === "generating"
                  ? "bg-primary/10 text-primary border-primary/20"
                  : state?.status === "cancelled"
                  ? "bg-muted text-muted-foreground border-border"
                  : "bg-muted text-muted-foreground border-border";
              return (
                <div key={avatarId} className="rounded-lg border bg-background p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <Badge variant="outline" className={statusClass}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <AgentMiniCard agentId={agent?.id ?? avatarId} />
                  <p className="mt-2 truncate text-xs text-muted-foreground">{modelId ?? "No model"}</p>
                  {state?.preview ? (
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{state.preview}</p>
                  ) : null}
                  {state?.error ? (
                    <p className="mt-1 text-xs text-destructive">{state.error}</p>
                  ) : null}
                  {state?.status === "failed" && activeRoundId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 text-xs"
                      onClick={() => {
                        void retryFailedAgent(avatarId);
                      }}
                      disabled={isAiThinking}
                    >
                      Retry Agent
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {failedAgentIds.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <h3 className="text-sm font-semibold text-destructive">Recovery</h3>
          <p className="text-xs text-muted-foreground">
            {failedAgentIds.length} agent response(s) failed for this round.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              void retryAllFailedAgents();
            }}
            disabled={isAiThinking}
          >
            Retry Failed Agents
          </Button>
        </section>
      ) : null}

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold">Round Timeline</h3>
        <div className="space-y-1">
          {firstThreadPage?.rounds?.length ? (
            firstThreadPage.rounds.map((round) => (
              <button
                key={round.id}
                type="button"
                onClick={() => setRoundFilter(round.id)}
                className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                  roundFilter === round.id
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{round.label}</span>
                  <span className="text-muted-foreground">{round.count}</span>
                </div>
              </button>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No rounds yet.</p>
          )}
          {roundFilter !== "all" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => setRoundFilter("all")}
            >
              Clear Round Filter
            </Button>
          ) : null}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-3">
        {hasPrivilegedAccess ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigateToSettingsForByok("sidebar")}
          >
            <Key className="mr-2 h-4 w-4" />
            {hasConfiguredOpenRouterKey ? "Manage BYOK" : "Enable BYOK"}
          </Button>
        ) : null}
      </section>
    </div>
  );

  const centerColumn = (
    <div className="flex h-full flex-col">
      <header className="border-b bg-background/80 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">{firstThreadPage?.rootPost.title ?? title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>{activeAvatarIds.length} active agents</span>
            {isAiThinking ? (
              <>
                <span className="inline-flex items-center gap-1 text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={cancelAgentGeneration}
                >
                  <Square className="mr-2 h-3.5 w-3.5" />
                  Cancel
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {!hasConfiguredOpenRouterKey && hasPrivilegedAccess ? (
        <div className="px-4 pt-3">
          <Alert>
            <Key className="h-4 w-4" />
            <AlertTitle>BYOK Needed for Agent Replies</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Add your OpenRouter key to continue multi-agent generation.</span>
              <Button size="sm" onClick={() => navigateToSettingsForByok("alert")}>
                Configure
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <RootPostCard
            post={
              firstThreadPage?.rootPost ?? {
                id: "root:loading",
                conversationId: conversationId ?? "",
                title,
                topic: script || null,
                createdAt: new Date().toISOString(),
              }
            }
            commentCount={threadNodes.length}
          />

          {threadLoading ? (
            <ThreadSkeleton />
          ) : threadError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {(threadError as Error).message || "Unable to load thread."}
            </div>
          ) : threadNodes.length === 0 ? (
            <ThreadEmptyState hasFilters={roundFilter !== "all" || agentFilter !== "all"} />
          ) : (
            <ThreadList
              nodes={threadNodes}
              collapsedIds={collapsedIds}
              selectedMessageId={selectedMessageId}
              linkTargetId={linkTargetId}
              roundLabelById={roundLabelById}
              onSelectMessage={setSelectedMessageId}
              onToggleCollapse={handleToggleCollapse}
              onReply={setReplyingToId}
              onCopyLink={copyMessageLink}
              onToggleHighlight={(messageId, highlighted) => {
                if (!conversationId) return;
                toggleHighlight
                  .mutateAsync({
                    conversationId,
                    messageId,
                    highlighted,
                    idempotencyKey: `${conversationId}:${messageId}:${highlighted}`,
                  })
                  .catch((error) => {
                    const message =
                      error instanceof Error
                        ? error.message
                        : "Failed to update highlight.";
                    toast({
                      title: "Error",
                      description: message,
                      variant: "destructive",
                    });
                  });
              }}
              renderReplyComposer={(node) => {
                if (replyingToId !== node.id) return null;
                const value = replyDrafts[node.id] ?? "";
                return (
                  <ThreadComposer
                    value={value}
                    onChange={(next) => {
                      setReplyDrafts((prev) => ({ ...prev, [node.id]: next }));
                    }}
                    onCancel={() => {
                      setReplyingToId(null);
                    }}
                    onSubmit={() => {
                      void submitReply({
                        parentMessageId: node.id,
                        content: value,
                        clear: () => {
                          setReplyDrafts((prev) => ({ ...prev, [node.id]: "" }));
                        },
                      });
                    }}
                    pending={pendingParentId === node.id || isAiThinking}
                    compact
                  />
                );
              }}
            />
          )}

          {hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void fetchNextPage();
                }}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading More
                  </>
                ) : (
                  "Load More"
                )}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-4xl space-y-3">
          <ModelSelectionDropdown
            selectedModels={selectedModels}
            onSelectionChange={setSelectedModels}
            disabled={!hasConfiguredOpenRouterKey || !hasPrivilegedAccess || isAiThinking}
            openSignal={modelSelectionOpenSignal}
            emphasize={nextStepState === "no_active_models"}
          />
          <div ref={rootComposerRef}>
            <ThreadComposer
              value={rootDraft}
              onChange={setRootDraft}
              onSubmit={() => {
                void submitReply({
                  parentMessageId: null,
                  content: rootDraft,
                  clear: () => setRootDraft(""),
                });
              }}
              placeholder="Post your argument or ask the agents to debate..."
              pending={pendingParentId === "root" || isAiThinking}
              disabled={!conversationId}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const rightSidebar = (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold">Selected Message</h3>
        {!selectedMessage ? (
          <p className="mt-2 text-xs text-muted-foreground">Select a message to inspect context and quick actions.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <AgentMiniCard agentId={selectedMessage.avatarId} />

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {selectedMessage.roundId ? (
                <RoundPill
                  label={roundLabelById[selectedMessage.roundId] ?? "Round"}
                  className="h-5 px-2"
                />
              ) : null}
              <span>{new Date(selectedMessage.createdAt).toLocaleString()}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!selectedMessage) return;
                  void copyMessageLink(selectedMessage.id);
                }}
              >
                Copy link
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!selectedMessage) return;
                  handleToggleCollapse(selectedMessage.id);
                }}
                disabled={(hasChildrenMap.get(selectedMessage.id) ?? 0) === 0}
              >
                Collapse thread
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectedMessage.isHighlight ? "secondary" : "outline"}
                onClick={() => {
                  if (!selectedMessage || !conversationId) return;
                  toggleHighlight
                    .mutateAsync({
                      conversationId,
                      messageId: selectedMessage.id,
                      highlighted: !selectedMessage.isHighlight,
                      idempotencyKey: `${conversationId}:${selectedMessage.id}:${!selectedMessage.isHighlight}`,
                    })
                    .catch((error) => {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Failed to update highlight.";
                      toast({
                        title: "Error",
                        description: message,
                        variant: "destructive",
                      });
                    });
                }}
              >
                Highlight
              </Button>
            </div>

            <div className="rounded-md border bg-background p-2 text-sm text-muted-foreground">
              <p className="line-clamp-8 whitespace-pre-wrap">{selectedMessage.content}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  if (!user) {
    return null;
  }

  return (
    <>
      <ThreadShell
        iconRail={
          <ActionRail
            conversationId={conversationId ?? undefined}
            messages={messages}
            conversationTitle={firstThreadPage?.rootPost.title ?? title}
          />
        }
        priorityCard={priorityCard}
        leftSidebar={leftSidebar}
        centerColumn={centerColumn}
        rightSidebar={rightSidebar}
      />
    </>
  );
};

export default Conference;
