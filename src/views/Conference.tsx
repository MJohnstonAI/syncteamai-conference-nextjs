import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { authedFetch } from "@/lib/auth-token";
import { getAgentMeta } from "@/lib/agents";
import {
  buildConferencePhaseSystemPrompt,
  getConferencePhaseForRoundNumber,
  getConferencePhaseMeta,
  type ConferenceAgentRole,
  type ConferencePhase,
} from "@/lib/conference/phases";
import {
  isPureRepetition,
  normalizeAgentOutput,
  parseDecisionBoardFromMessage,
  type DecisionBoard,
} from "@/lib/conference/quality";
import type { ThreadSort } from "@/lib/thread/types";
import { ArrowRight, CalendarDays, ChevronRight, Clock3, Key, Loader2, Sparkles, Square } from "lucide-react";

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

type PendingPhaseRun = {
  userMessageId: string;
  avatarIds: string[];
  transcriptSeed: TranscriptMessage[];
  phase: ConferencePhase;
  roundNumber: number;
};

type QueuedHumanReply = {
  parentMessageId: string | null;
  content: string;
};

type NextStepState =
  | "session_booting"
  | "pending_run"
  | "phase_checkpoint"
  | "partial_failure"
  | "no_byok"
  | "no_active_models"
  | "idle";

type ConfigurationSeed = {
  title: string;
  script: string;
  promptScriptId: string | null;
};

const Conference = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
  const {
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
  const [activePhase, setActivePhase] = useState<ConferencePhase>("diverge");
  const [activeRoundNumber, setActiveRoundNumber] = useState(1);
  const [checkpointBetweenPhases, setCheckpointBetweenPhases] = useState(false);
  const [pendingPhaseRun, setPendingPhaseRun] = useState<PendingPhaseRun | null>(null);
  const [queuedHumanReplies, setQueuedHumanReplies] = useState<QueuedHumanReply[]>([]);
  const [modelSelectionOpenSignal, setModelSelectionOpenSignal] = useState(0);
  const [resolvedConfigurationSeed, setResolvedConfigurationSeed] = useState<ConfigurationSeed | null>(null);
  const [isConfigurationSeedLoading, setIsConfigurationSeedLoading] = useState(false);

  const hasCreatedConversation = useRef(false);
  const generationAbortRef = useRef<AbortController | null>(null);
  const roundTranscriptRef = useRef<TranscriptMessage[]>([]);
  const roundMessageIdRef = useRef<string | null>(null);
  const roundCitationIdsRef = useRef<string[]>([]);
  const queuedHumanRepliesRef = useRef<QueuedHumanReply[]>([]);
  const activePhaseRef = useRef<ConferencePhase>("diverge");
  const activeRoundNumberRef = useRef(1);
  const rootComposerRef = useRef<HTMLDivElement | null>(null);

  const configurationId =
    searchParams.get("config_id") ?? searchParams.get("configId");
  const queryTitle = searchParams.get("title");
  const queryScript = searchParams.get("script");
  const queryPromptScriptId = searchParams.get("prompt_id");
  const title = queryTitle || resolvedConfigurationSeed?.title || "Conference";
  const script = queryScript || resolvedConfigurationSeed?.script || "";
  const promptScriptId =
    queryPromptScriptId || resolvedConfigurationSeed?.promptScriptId || null;
  const linkedMessageId = searchParams.get("msg");
  const canAutoCreateConversation =
    !isConfigurationSeedLoading &&
    (!configurationId || Boolean(queryTitle || resolvedConfigurationSeed?.title));

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
      navigate("/templates", { replace: true });
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    let cancelled = false;

    if (!configurationId || queryTitle || searchParams.get("conversation_id")) {
      setResolvedConfigurationSeed(null);
      setIsConfigurationSeedLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (loading || !user) {
      return () => {
        cancelled = true;
      };
    }

    setIsConfigurationSeedLoading(true);

    void authedFetch(`/api/conference-configurations/${configurationId}`, {
      method: "GET",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | {
              configuration?: {
                problem_statement?: string | null;
                template_title?: string | null;
                template_script?: string | null;
                template_id?: string | null;
              };
              error?: string;
            }
          | null;

        if (!response.ok || !payload?.configuration) {
          throw new Error(payload?.error ?? "Failed to load saved configuration.");
        }

        if (cancelled) return;

        const resolvedTitle =
          payload.configuration.problem_statement ||
          payload.configuration.template_title ||
          "Conference";

        setResolvedConfigurationSeed({
          title: resolvedTitle,
          script: payload.configuration.template_script || "",
          promptScriptId: payload.configuration.template_id || null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load saved configuration.";
        toast({
          title: "Configuration unavailable",
          description: message,
          variant: "destructive",
        });
      })
      .finally(() => {
        if (cancelled) return;
        setIsConfigurationSeedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [configurationId, loading, queryTitle, searchParams, toast, user]);

  useEffect(() => {
    if (hasCreatedConversation.current) return;

    if (
      !loading &&
      user &&
      !conversationId &&
      title &&
      !searchParams.get("conversation_id") &&
      canAutoCreateConversation
    ) {
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
    canAutoCreateConversation,
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
    setActivePhase("diverge");
    setActiveRoundNumber(1);
    setPendingPhaseRun(null);
    setQueuedHumanReplies([]);
    activePhaseRef.current = "diverge";
    activeRoundNumberRef.current = 1;
    roundCitationIdsRef.current = [];
    queuedHumanRepliesRef.current = [];
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

  const hasModelDiversity = useMemo(() => {
    const modelIds = activeAvatarIds
      .map((avatarId) => getModelForAvatar(avatarId))
      .filter((value): value is string => Boolean(value));
    return new Set(modelIds).size > 1;
  }, [activeAvatarIds, getModelForAvatar]);

  const resolveRunRoles = useCallback((avatarIds: string[]) => {
    const roleMap: Record<string, ConferenceAgentRole> = {};
    if (avatarIds.length === 0) return roleMap;

    for (const avatarId of avatarIds) {
      roleMap[avatarId] = "default";
    }

    const synthesizerId = avatarIds[avatarIds.length - 1];
    roleMap[synthesizerId] = "synthesizer";

    if (avatarIds.length > 1) {
      const contrarianCandidate = avatarIds[0];
      if (contrarianCandidate !== synthesizerId) {
        roleMap[contrarianCandidate] = "contrarian";
      }
    }

    return roleMap;
  }, []);

  const decisionBoard = useMemo<DecisionBoard | null>(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "assistant") continue;
      const parsed = parseDecisionBoardFromMessage(message.content);
      if (!parsed) continue;
      return {
        ...parsed,
        sourceMessageId: message.id,
      };
    }
    return null;
  }, [messages]);

  const activeRoleMap = useMemo(
    () => resolveRunRoles(activeAvatarIds),
    [activeAvatarIds, resolveRunRoles]
  );

  const enqueueHumanReply = useCallback((entry: QueuedHumanReply) => {
    setQueuedHumanReplies((previous) => {
      const next = [...previous, entry];
      queuedHumanRepliesRef.current = next;
      return next;
    });
  }, []);

  const dequeueHumanReply = useCallback(() => {
    const queue = queuedHumanRepliesRef.current;
    if (queue.length === 0) return null;
    const [next, ...rest] = queue;
    queuedHumanRepliesRef.current = rest;
    setQueuedHumanReplies(rest);
    return next;
  }, []);

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
      phase,
      roundNumber,
      citationMessageIds,
    }: {
      userMessageId: string;
      avatarIds: string[];
      transcriptSeed: TranscriptMessage[];
      phase: ConferencePhase;
      roundNumber: number;
      citationMessageIds: string[];
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
      const runRoles = resolveRunRoles(avatarIds);

      try {
        for (let avatarIndex = 0; avatarIndex < avatarIds.length; avatarIndex += 1) {
          const avatarId = avatarIds[avatarIndex];
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
            const agentName = getAgentMeta(avatarId)?.name ?? avatarId;
            const agentRole = runRoles[avatarId] ?? "default";
            const phasePrompt = buildConferencePhaseSystemPrompt({
              phase,
              roundNumber,
              agentName,
              agentRole,
              citationMessageIds,
              fallbackReferenceId: userMessageId,
            });
            const result = await streamAgentGeneration({
              conversationId,
              roundId: userMessageId,
              selectedAvatar: avatarId,
              modelId,
              messages: [
                { role: "system", content: phasePrompt },
                ...transcript,
              ],
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

            const normalized = normalizeAgentOutput({
              content: aiContent,
              phase,
              agentRole,
              allowedReferenceIds: citationMessageIds,
              fallbackReferenceId: userMessageId,
            });

            const priorAssistantMessages = transcript
              .filter((item) => item.role === "assistant")
              .map((item) => item.content);
            if (
              isPureRepetition({
                candidate: normalized.content,
                priorAssistantMessages,
              })
            ) {
              throw new Error("Response repeated prior points without additive value.");
            }

            await createReply.mutateAsync({
              conversationId,
              roundId: userMessageId,
              parentMessageId: userMessageId,
              content: normalized.content,
              replyMode: "agent",
              avatarId,
              idempotencyKey: `${idempotencyKey}:persist`,
            });

            transcript.push({ role: "assistant", content: normalized.content });
            roundTranscriptRef.current = transcript;

            setAgentState(avatarId, {
              status: "completed",
              preview: normalized.content.slice(0, 1000),
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

          const queuedReply = dequeueHumanReply();
          if (queuedReply) {
            try {
              const queuedMessage = await createUserReply({
                parentMessageId: queuedReply.parentMessageId,
                content: queuedReply.content,
              });

              setSelectedMessageId(queuedMessage.id);
              setReplyingToId(null);

              const followupRoundNumber = activeRoundNumberRef.current + 1;
              const followupPhase = getConferencePhaseForRoundNumber(followupRoundNumber);
              setActivePhase(followupPhase);
              setActiveRoundNumber(followupRoundNumber);
              activePhaseRef.current = followupPhase;
              activeRoundNumberRef.current = followupRoundNumber;

              const followupTranscript = [
                ...transcript,
                { role: "user" as const, content: queuedMessage.content },
              ];
              roundTranscriptRef.current = followupTranscript;
              roundMessageIdRef.current = queuedMessage.id;
              setActiveRoundId(queuedMessage.id);
              setFailedAgentIds([]);
              setPendingPhaseRun(null);

              const followupCitationIds = Array.from(
                new Set([queuedMessage.id, ...roundCitationIdsRef.current])
              ).slice(0, 8);
              roundCitationIdsRef.current = followupCitationIds;

              const remainingAvatarIds = avatarIds.slice(avatarIndex + 1);
              const followupAvatarIds =
                remainingAvatarIds.length > 0 ? remainingAvatarIds : avatarIds;
              setAgentRunStates((previous) => {
                const next = { ...previous };
                for (const followupAvatarId of followupAvatarIds) {
                  next[followupAvatarId] = {
                    status: "queued",
                    modelId: getModelForAvatar(followupAvatarId) ?? null,
                    preview: "",
                    error: null,
                  };
                }
                return next;
              });

              const followupResult = await runAgentBatch({
                userMessageId: queuedMessage.id,
                avatarIds: followupAvatarIds,
                transcriptSeed: followupTranscript,
                phase: followupPhase,
                roundNumber: followupRoundNumber,
                citationMessageIds: followupCitationIds,
              });
              return {
                failed: Array.from(new Set([...failed, ...followupResult.failed])),
                cancelled: followupResult.cancelled,
              };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Failed to process queued human message.";
              toast({
                title: "Queue error",
                description: message,
                variant: "destructive",
              });
            }
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
      createUserReply,
      dequeueHumanReply,
      getModelForAvatar,
      resolveRunRoles,
      setAgentState,
      toast,
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
        phase: activePhaseRef.current,
        roundNumber: activeRoundNumberRef.current,
        citationMessageIds: roundCitationIdsRef.current,
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
      phase: activePhaseRef.current,
      roundNumber: activeRoundNumberRef.current,
      citationMessageIds: roundCitationIdsRef.current,
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
      if (!trimmed || !conversationId || pendingParentId) {
        return;
      }

      if (isAiThinking) {
        enqueueHumanReply({
          parentMessageId,
          content: trimmed,
        });
        clear();
        setReplyingToId(null);
        toast({
          title: "Queued",
          description: "Your message is queued and will post after the current agent finishes.",
        });
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
        const previousPhase = activePhaseRef.current;
        const existingRoundCount = firstThreadPage?.rounds.length ?? 0;
        const nextRoundNumber = existingRoundCount + 1;
        const nextPhase = getConferencePhaseForRoundNumber(nextRoundNumber);
        setActivePhase(nextPhase);
        setActiveRoundNumber(nextRoundNumber);
        activePhaseRef.current = nextPhase;
        activeRoundNumberRef.current = nextRoundNumber;

        setSelectedMessageId(userMessage.id);
        setReplyingToId(null);

        if (!hasConfiguredOpenRouterKey || !hasPrivilegedAccess) {
          toast({
            title: "BYOK Required",
            description: "Add your OpenRouter API key on the Sign-in page to continue.",
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
        setPendingPhaseRun(null);

        const recentThreadIds = threadNodes.slice(-8).map((node) => node.id);
        const citationMessageIds = Array.from(new Set([userMessage.id, ...recentThreadIds])).slice(0, 8);
        roundCitationIdsRef.current = citationMessageIds;

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

        const phaseTransition =
          existingRoundCount > 0 && nextPhase !== previousPhase;
        if (checkpointBetweenPhases && phaseTransition) {
          setPendingPhaseRun({
            userMessageId: userMessage.id,
            avatarIds: activeAvatarIds,
            transcriptSeed: transcript,
            phase: nextPhase,
            roundNumber: nextRoundNumber,
          });
          toast({
            title: "Phase checkpoint",
            description: `Round ${nextRoundNumber} is ready (${getConferencePhaseMeta(nextPhase).label}). Review and continue when ready.`,
          });
          return;
        }

        const result = await runAgentBatch({
          userMessageId: userMessage.id,
          avatarIds: activeAvatarIds,
          transcriptSeed: transcript,
          phase: nextPhase,
          roundNumber: nextRoundNumber,
          citationMessageIds,
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
      checkpointBetweenPhases,
      conversationId,
      createUserReply,
      enqueueHumanReply,
      getModelForAvatar,
      hasConfiguredOpenRouterKey,
      hasPrivilegedAccess,
      firstThreadPage?.rounds.length,
      isAiThinking,
      messages,
      pendingParentId,
      runAgentBatch,
      threadNodes,
      toast,
    ]
  );

  const continuePendingPhaseRun = useCallback(async () => {
    if (!pendingPhaseRun || isAiThinking) return;

    setPendingPhaseRun(null);
    const result = await runAgentBatch({
      ...pendingPhaseRun,
      citationMessageIds: roundCitationIdsRef.current,
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
  }, [isAiThinking, pendingPhaseRun, runAgentBatch, toast]);

  const handleOpenSessionVault = useCallback(() => {
    const params = new URLSearchParams();
    if (conversationId) {
      params.set("conversation_id", conversationId);
    }
    const target = params.toString() ? `/sessions?${params.toString()}` : "/sessions";
    navigate(target);
  }, [conversationId, navigate]);

  const handleEndConference = useCallback(() => {
    if (isAiThinking) {
      cancelAgentGeneration();
    }
    navigate("/templates");
  }, [cancelAgentGeneration, isAiThinking, navigate]);

  const conferenceReturnPath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `/conference?${query}` : "/conference";
  }, [searchParams]);

  const navigateToAuthForByok = useCallback(
    (entry: "next_step" | "sidebar" | "alert") => {
      const params = new URLSearchParams({
        step: "2",
        source: "conference",
        entry,
        return_to: conferenceReturnPath,
      });
      navigate(`/auth?${params.toString()}`);
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
    if (pendingPhaseRun) return "phase_checkpoint";
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
    pendingPhaseRun,
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
            ? queuedHumanReplies.length > 0
              ? `${queuedHumanReplies.length} human message(s) queued to post after the current agent finishes.`
              : "Wait for completion or stop now if you need to change direction."
            : "Your prompt is being posted to the thread.",
          actionLabel: isAiThinking ? "Pause run" : "Sending...",
          actionVariant: "outline" as const,
          actionDisabled: !isAiThinking,
        };
      case "phase_checkpoint":
        return {
          badgeVariant: "outline" as const,
          badgeLabel: "Checkpoint",
          title: "Phase checkpoint is ready",
          description:
            pendingPhaseRun
              ? `Round ${pendingPhaseRun.roundNumber} is queued for ${getConferencePhaseMeta(pendingPhaseRun.phase).label}.`
              : "The next phase is waiting for your confirmation.",
          actionLabel: "Start next phase",
          actionVariant: "default" as const,
          actionDisabled: !pendingPhaseRun,
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
  }, [
    failedAgentIds.length,
    hasPrivilegedAccess,
    isAiThinking,
    nextStepState,
    pendingPhaseRun,
    queuedHumanReplies.length,
    threadNodes.length,
  ]);

  const handleNextStepPrimaryAction = useCallback(() => {
    switch (nextStepState) {
      case "pending_run":
        if (isAiThinking) {
          cancelAgentGeneration();
        }
        return;
      case "phase_checkpoint":
        void continuePendingPhaseRun();
        return;
      case "partial_failure":
        void retryAllFailedAgents();
        return;
      case "no_byok":
        if (hasPrivilegedAccess) {
          navigateToAuthForByok("next_step");
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
    continuePendingPhaseRun,
    focusRootComposer,
    hasPrivilegedAccess,
    isAiThinking,
    navigate,
    navigateToAuthForByok,
    nextStepState,
    openModelSelection,
    retryAllFailedAgents,
  ]);

  const currentRoundCount = firstThreadPage?.rounds.length ?? 0;
  const nextRoundNumber = currentRoundCount + 1;
  const hasActiveRoundContext =
    isAiThinking || pendingParentId !== null || failedAgentIds.length > 0 || pendingPhaseRun !== null;
  const displayPhase = hasActiveRoundContext
    ? activePhase
    : getConferencePhaseForRoundNumber(nextRoundNumber);
  const displayRoundNumber = hasActiveRoundContext
    ? activeRoundNumber
    : nextRoundNumber;
  const displayPhaseMeta = getConferencePhaseMeta(displayPhase);

  const conferenceTitle = firstThreadPage?.rootPost.title ?? title;
  const conferenceDateParts = useMemo(() => {
    const sourceTimestamp = firstThreadPage?.rootPost.createdAt ?? messages[0]?.created_at ?? null;
    if (!sourceTimestamp) {
      return { date: "--", time: "--" };
    }

    const parsed = new Date(sourceTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      return { date: "--", time: "--" };
    }

    return {
      date: parsed.toLocaleDateString(),
      time: parsed.toLocaleTimeString(),
    };
  }, [firstThreadPage?.rootPost.createdAt, messages]);

  const editorialPanelClass =
    "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_8px_28px_-18px_rgba(15,23,42,0.28)] dark:border-slate-700/80 dark:bg-[#141a26]";

  const priorityCard =
    nextStepState === "no_byok" ? null : (
      <section className="mx-auto w-full max-w-5xl rounded-[1.35rem] bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-[2px] shadow-[0_20px_45px_-24px_rgba(79,70,229,0.8)]">
        <div className="rounded-[1.2rem] bg-white px-5 py-4 dark:bg-[#141a26] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-300">
                  {hasPrivilegedAccess ? "Conference Flow" : "Access Required"}
                </p>
                <Badge variant="outline" className="text-[10px] uppercase tracking-[0.12em]">
                  Phase {displayPhaseMeta.label}
                </Badge>
                <Badge variant={nextStepMeta.badgeVariant} className="text-[10px] uppercase tracking-[0.12em]">
                  {nextStepMeta.badgeLabel}
                </Badge>
              </div>
              <h2 className="font-[var(--font-playfair)] text-2xl font-bold leading-tight text-slate-900 dark:text-slate-100">
                {nextStepMeta.title}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-300">{nextStepMeta.description}</p>
              <p className="text-xs text-slate-500 dark:text-slate-300">
                Round {displayRoundNumber}: {displayPhaseMeta.shortDescription}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={nextStepMeta.actionVariant}
              onClick={handleNextStepPrimaryAction}
              disabled={nextStepMeta.actionDisabled}
              className="h-11 min-w-44 rounded-xl px-5 text-sm font-semibold"
            >
              {nextStepMeta.actionLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    );

  const leftSidebar = (
    <div className="space-y-4 pb-4">
      <section className={editorialPanelClass}>
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">Conference</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
          End this session and pick a template for the next conference.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-amber-300 bg-amber-50 capitalize text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {effectiveRole}
          </Badge>
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
          className="mt-4 h-10 w-full rounded-xl border-slate-200 bg-white text-sm font-medium dark:border-slate-600 dark:bg-[#1f2736]"
          onClick={handleEndConference}
        >
          End Conference
        </Button>
      </section>

      <section className={editorialPanelClass}>
        <h3 className="font-[var(--font-playfair)] text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Session Vault
        </h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
          Open the full vault to browse every saved session with search and pagination.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 h-10 w-full rounded-xl border-slate-200 bg-white text-sm font-medium dark:border-slate-600 dark:bg-[#1f2736]"
          onClick={handleOpenSessionVault}
        >
          Open Session Vault
        </Button>
      </section>

      <section className={editorialPanelClass}>
        <h3 className="font-[var(--font-playfair)] text-xl font-semibold text-slate-900 dark:text-slate-100">
          Sort & Filters
        </h3>
        <div className="mt-3">
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
        </div>
      </section>

      <section className={editorialPanelClass}>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
          Inquiry Phase
        </h3>
        <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Round {displayRoundNumber}: {displayPhaseMeta.label}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
          {displayPhaseMeta.shortDescription}
        </p>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-[#1b2331]">
          <div className="pr-3">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Checkpoint Between Phases</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-300">
              Pause at phase transitions before agents continue.
            </p>
          </div>
          <Switch
            checked={checkpointBetweenPhases}
            onCheckedChange={setCheckpointBetweenPhases}
            aria-label="Toggle phase checkpoint"
          />
        </div>
        {pendingPhaseRun ? (
          <p className="mt-2 text-[11px] text-indigo-600 dark:text-indigo-300">
            Checkpoint pending: Round {pendingPhaseRun.roundNumber} ({getConferencePhaseMeta(pendingPhaseRun.phase).label})
          </p>
        ) : null}
      </section>

      <section className={editorialPanelClass}>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">Active Agents</h3>
        {activeAvatarIds.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-300">
            Activate at least one model to receive agent replies.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {!hasModelDiversity ? (
              <p className="rounded-lg border border-amber-300/70 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                All active agents are currently mapped to the same model. Add at least one different model for better disagreement quality.
              </p>
            ) : null}
            {activeAvatarIds.map((avatarId, index) => {
              const modelId = getModelForAvatar(avatarId);
              const agent = getAgentMeta(avatarId);
              const roleMode = activeRoleMap[avatarId] ?? "default";
              const roleLabel =
                roleMode === "contrarian"
                  ? "Contrarian"
                  : roleMode === "synthesizer"
                  ? "Synthesizer"
                  : "Contributor";
              const state = agentRunStates[avatarId];
              const statusLabel = state?.status ? state.status.replace("_", " ") : "idle";
              const statusClass =
                state?.status === "completed"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  : state?.status === "failed"
                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                  : state?.status === "generating"
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : state?.status === "cancelled"
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-border bg-muted text-muted-foreground";
              return (
                <div
                  key={avatarId}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-[#1b2331]"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline">{roleLabel}</Badge>
                      <Badge variant="outline" className={statusClass}>
                        {statusLabel}
                      </Badge>
                    </div>
                  </div>
                  <AgentMiniCard agentId={agent?.id ?? avatarId} />
                  <p className="mt-2 truncate text-xs text-slate-500 dark:text-slate-300">{modelId ?? "No model"}</p>
                  {state?.preview ? (
                    <p className="mt-1 line-clamp-3 text-xs text-slate-500 dark:text-slate-300">{state.preview}</p>
                  ) : null}
                  {state?.error ? (
                    <p className="mt-1 text-xs text-destructive">{state.error}</p>
                  ) : null}
                  {state?.status === "failed" && activeRoundId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-7 rounded-lg text-xs"
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
        <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <h3 className="text-sm font-semibold text-destructive">Recovery</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            {failedAgentIds.length} agent response(s) failed for this round.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full rounded-lg"
            onClick={() => {
              void retryAllFailedAgents();
            }}
            disabled={isAiThinking}
          >
            Retry Failed Agents
          </Button>
        </section>
      ) : null}

      <section className={editorialPanelClass}>
        <h3 className="font-[var(--font-playfair)] text-lg font-semibold text-slate-900 dark:text-slate-100">
          Round Timeline
        </h3>
        <div className="mt-3 space-y-2">
          {firstThreadPage?.rounds?.length ? (
            firstThreadPage.rounds.map((round) => (
              <button
                key={round.id}
                type="button"
                onClick={() => setRoundFilter(round.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                  roundFilter === round.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#1d2534] dark:text-slate-300 dark:hover:bg-[#232d3f]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{round.label}</span>
                  <span className="text-muted-foreground">{round.count}</span>
                </div>
              </button>
            ))
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-300">No rounds yet.</p>
          )}
          {roundFilter !== "all" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full rounded-lg text-xs"
              onClick={() => setRoundFilter("all")}
            >
              Clear Round Filter
            </Button>
          ) : null}
        </div>
      </section>

      {hasPrivilegedAccess ? (
        <section className={editorialPanelClass}>
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-xl border-slate-200 bg-white dark:border-slate-600 dark:bg-[#1f2736]"
            onClick={() => navigateToAuthForByok("sidebar")}
          >
            <Key className="mr-2 h-4 w-4" />
            {hasConfiguredOpenRouterKey ? "Manage BYOK" : "Enable BYOK"}
          </Button>
        </section>
      ) : null}
    </div>
  );

  const centerColumn = (
    <div className="flex h-full flex-col bg-[#f3f4f6] dark:bg-[#0f1118]">
      <header className="border-b border-slate-200/90 bg-white/80 px-5 py-3 backdrop-blur-md dark:border-slate-700 dark:bg-[#141a26]/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
            <span>Conference</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="truncate font-medium text-slate-900 dark:text-slate-100">{conferenceTitle}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              Phase {displayPhaseMeta.label}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <Sparkles className="h-4 w-4" />
              {activeAvatarIds.length} active agents
            </span>
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
                  className="rounded-lg"
                  >
                    <Square className="mr-2 h-3.5 w-3.5" />
                    Pause
                  </Button>
                </>
              ) : null}
          </div>
        </div>
      </header>

      {!hasConfiguredOpenRouterKey && hasPrivilegedAccess ? (
        <div className="px-5 pt-4">
          <Alert className="border border-indigo-500/30 bg-indigo-50/70 dark:border-indigo-500/40 dark:bg-indigo-500/10">
            <Key className="h-4 w-4" />
            <AlertTitle>BYOK Needed for Agent Replies</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>Add your OpenRouter key to continue multi-agent generation.</span>
              <Button size="sm" onClick={() => navigateToAuthForByok("alert")} className="rounded-lg">
                Configure
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto w-full max-w-5xl space-y-5">
          <section className="border-b border-slate-200 pb-6 dark:border-slate-700">
            <h1 className="font-[var(--font-playfair)] text-4xl font-bold leading-tight text-slate-900 dark:text-slate-100 md:text-6xl">
              {conferenceTitle}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-slate-500 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {conferenceDateParts.date}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" />
                {conferenceDateParts.time}
              </span>
            </div>
          </section>

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
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
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
                className="rounded-xl"
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

      <div className="border-t border-slate-200/80 bg-white/90 px-5 py-4 backdrop-blur-lg dark:border-slate-700 dark:bg-[#141a26]/90">
        <div className="mx-auto w-full max-w-5xl space-y-3">
          <ModelSelectionDropdown
            selectedModels={selectedModels}
            onSelectionChange={setSelectedModels}
            disabled={!hasConfiguredOpenRouterKey || !hasPrivilegedAccess || isAiThinking}
            openSignal={modelSelectionOpenSignal}
            emphasize={nextStepState === "no_active_models"}
          />
          {queuedHumanReplies.length > 0 ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-300">
              {queuedHumanReplies.length} human message(s) queued. They will post immediately after the current agent reply completes.
            </div>
          ) : null}
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
      <section className={editorialPanelClass}>
        <h3 className="font-[var(--font-playfair)] text-xl font-semibold text-slate-900 dark:text-slate-100">
          Decision Board
        </h3>
        {!decisionBoard ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
            The synthesizer will publish Decision Board updates with claim, trade-offs, confidence, and next action.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <p><span className="font-semibold text-slate-900 dark:text-slate-100">Claim:</span> {decisionBoard.claim}</p>
            <p><span className="font-semibold text-slate-900 dark:text-slate-100">For:</span> {decisionBoard.forCase}</p>
            <p><span className="font-semibold text-slate-900 dark:text-slate-100">Against:</span> {decisionBoard.againstCase}</p>
            <p><span className="font-semibold text-slate-900 dark:text-slate-100">Confidence:</span> {decisionBoard.confidence}</p>
            <p><span className="font-semibold text-slate-900 dark:text-slate-100">Next Action:</span> {decisionBoard.nextAction}</p>
            {decisionBoard.sourceMessageId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 rounded-lg"
                onClick={() => {
                  setSelectedMessageId(decisionBoard.sourceMessageId ?? null);
                  setLinkTargetId(decisionBoard.sourceMessageId ?? null);
                  document.getElementById(`message-${decisionBoard.sourceMessageId}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }}
              >
                Open source message
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <section className={editorialPanelClass}>
        <h3 className="font-[var(--font-playfair)] text-xl font-semibold text-slate-900 dark:text-slate-100">
          Selected Message
        </h3>
        {!selectedMessage ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
            Select a message to inspect context and quick actions.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <AgentMiniCard agentId={selectedMessage.avatarId} />

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
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
                className="rounded-lg"
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
                className="rounded-lg"
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
                className="rounded-lg"
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

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-[#1b2331] dark:text-slate-300">
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
    <div data-conference-page>
      <ThreadShell
        iconRail={
          <ActionRail
            conversationId={conversationId ?? undefined}
            messages={messages}
            conversationTitle={conferenceTitle}
          />
        }
        priorityCard={priorityCard}
        leftSidebar={leftSidebar}
        centerColumn={centerColumn}
        rightSidebar={rightSidebar}
      />
    </div>
  );
};

export default Conference;
