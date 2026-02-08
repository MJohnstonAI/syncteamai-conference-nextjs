import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BYOKModal } from "@/components/BYOKModal";
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
import { useAuth } from "@/hooks/useAuth";
import { useCreateConversation } from "@/hooks/useConversations";
import {
  useCreateThreadReply,
  useThread,
  useToggleThreadHighlight,
} from "@/hooks/useThread";
import { useUserRole } from "@/hooks/useUserRole";
import { useBYOK } from "@/hooks/useBYOK";
import { useToast } from "@/hooks/use-toast";
import { authedFetch } from "@/lib/auth-token";
import { getAgentMeta } from "@/lib/agents";
import type { ThreadSort } from "@/lib/thread/types";
import { supabase } from "@/integrations/supabase/client";
import { Key, Loader2, Sparkles } from "lucide-react";

const Conference = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
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
  const [showBYOKModal, setShowBYOKModal] = useState(false);
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

  const hasCreatedConversation = useRef(false);

  const title = searchParams.get("title") || "Conference";
  const script = searchParams.get("script") || "";
  const promptScriptId = searchParams.get("prompt_id");
  const promptOwnerId = searchParams.get("prompt_user_id");
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
    data: threadData,
    isLoading: threadLoading,
    error: threadError,
  } = useThread({
    conversationId,
    roundId: roundFilter,
    agentId: agentFilter,
    sort: sortMode,
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [navigate, user]);

  useEffect(() => {
    if (hasCreatedConversation.current) return;

    if (user && !conversationId && title && !searchParams.get("conversation_id")) {
      hasCreatedConversation.current = true;

      createConversation.mutate(
        {
          title,
          script: script || undefined,
          promptScriptId: promptScriptId || undefined,
          overrideUserId: promptOwnerId || undefined,
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
    navigate,
    promptOwnerId,
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
  }, [conversationId]);

  useEffect(() => {
    return () => {
      hasCreatedConversation.current = false;
    };
  }, []);

  const roundLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const round of threadData?.rounds ?? []) {
      map[round.id] = round.label;
    }
    return map;
  }, [threadData?.rounds]);

  const activeAvatarIds = useMemo(() => {
    return avatarOrder.filter((avatarId) => {
      const modelId = getModelForAvatar(avatarId);
      return Boolean(modelId && activeModels.includes(modelId));
    });
  }, [activeModels, avatarOrder, getModelForAvatar]);

  useEffect(() => {
    if (!threadData?.nodes?.length) {
      setSelectedMessageId(null);
      return;
    }

    if (!selectedMessageId || !threadData.nodes.some((node) => node.id === selectedMessageId)) {
      setSelectedMessageId(threadData.nodes[0].id);
    }
  }, [selectedMessageId, threadData?.nodes]);

  useEffect(() => {
    if (!threadData?.nodes?.length || !linkedMessageId) return;
    const exists = threadData.nodes.some((node) => node.id === linkedMessageId);
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
  }, [linkedMessageId, threadData?.nodes]);

  useEffect(() => {
    if (!threadData?.nodes?.length) {
      if (collapsedIds.size > 0) {
        setCollapsedIds(new Set());
      }
      return;
    }

    const nodeIdSet = new Set(threadData.nodes.map((node) => node.id));
    const next = new Set<string>();
    collapsedIds.forEach((id) => {
      if (nodeIdSet.has(id)) next.add(id);
    });

    if (next.size !== collapsedIds.size) {
      setCollapsedIds(next);
    }
  }, [collapsedIds, threadData?.nodes]);

  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return null;
    return threadData?.nodes.find((node) => node.id === selectedMessageId) ?? null;
  }, [selectedMessageId, threadData?.nodes]);

  const hasChildrenMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of threadData?.nodes ?? []) {
      if (!node.parentMessageId) continue;
      map.set(node.parentMessageId, (map.get(node.parentMessageId) ?? 0) + 1);
    }
    return map;
  }, [threadData?.nodes]);

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

  const fetchTranscript = useCallback(async () => {
    if (!conversationId) return [] as Array<{ role: "user" | "assistant" | "system"; content: string }>;

    const { data, error } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((item) => ({
      role: item.role as "user" | "assistant" | "system",
      content: item.content,
    }));
  }, [conversationId]);

  const generateAssistantReplies = useCallback(
    async ({
      userMessageId,
      transcript,
    }: {
      userMessageId: string;
      transcript: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    }) => {
      if (!conversationId) return;

      const orderedAvatarIds = avatarOrder.filter((id) => {
        const modelId = getModelForAvatar(id);
        return Boolean(modelId && activeModels.includes(modelId));
      });

      for (const avatarId of orderedAvatarIds) {
        const modelId = getModelForAvatar(avatarId);
        if (!modelId) continue;

        const idempotencyKey = `${conversationId}:${userMessageId}:${avatarId}:${modelId}`;
        const response = await authedFetch("/api/ai/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({
            conversationId,
            roundId: userMessageId,
            messages: transcript,
            selectedAvatar: avatarId,
            modelId,
            openRouterKey: openRouterKey ?? undefined,
            idempotencyKey,
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          response?: string;
          retryAfterSec?: number;
        };

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = payload.retryAfterSec ?? 10;
            throw new Error(`Rate limited. Retry in ${retryAfter}s.`);
          }
          if (response.status === 403) {
            throw new Error(payload.error || "Access required to generate responses.");
          }
          if (response.status === 503) {
            throw new Error("OpenRouter is busy right now. Please retry in a moment.");
          }
          throw new Error(payload.error || `Generation failed with ${response.status}`);
        }

        const aiContent = payload.response || "No response";

        await createReply.mutateAsync({
          conversationId,
          roundId: userMessageId,
          parentMessageId: userMessageId,
          content: aiContent,
          replyMode: "agent",
          avatarId,
        });

        transcript.push({ role: "assistant", content: aiContent });
      }
    },
    [activeModels, avatarOrder, conversationId, createReply, getModelForAvatar, openRouterKey]
  );

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

        setIsAiThinking(true);
        const transcript = await fetchTranscript();
        await generateAssistantReplies({
          userMessageId: userMessage.id,
          transcript,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send reply.";
        toast({
          title: "Error",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsAiThinking(false);
        setPendingParentId(null);
      }
    },
    [
      conversationId,
      createUserReply,
      fetchTranscript,
      generateAssistantReplies,
      hasConfiguredOpenRouterKey,
      hasPrivilegedAccess,
      isAiThinking,
      pendingParentId,
      toast,
    ]
  );

  const leftSidebar = (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Conference</p>
        <h2 className="mt-1 text-lg font-semibold leading-tight">{threadData?.rootPost.title ?? title}</h2>
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
          onClick={() => {
            setConversationId(null);
            navigate("/conference");
          }}
        >
          New Conference
        </Button>
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
          rounds={threadData?.rounds ?? []}
          agents={threadData?.agents ?? []}
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
              return (
                <div key={avatarId} className="rounded-lg border bg-background p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="outline">#{index + 1}</Badge>
                    <span className="truncate text-xs text-muted-foreground">{modelId ?? "No model"}</span>
                  </div>
                  <AgentMiniCard agentId={agent?.id ?? avatarId} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-3">
        <h3 className="text-sm font-semibold">Round Timeline</h3>
        <div className="space-y-1">
          {threadData?.rounds?.length ? (
            threadData.rounds.map((round) => (
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
          <Button variant="outline" size="sm" className="w-full" onClick={() => setShowBYOKModal(true)}>
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
          <h1 className="text-xl font-semibold">{threadData?.rootPost.title ?? title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span>{activeAvatarIds.length} active agents</span>
            {isAiThinking ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating
              </span>
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
              <Button size="sm" onClick={() => setShowBYOKModal(true)}>
                Configure
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <RootPostCard post={threadData?.rootPost ?? {
            id: "root:loading",
            conversationId: conversationId ?? "",
            title,
            topic: script || null,
            createdAt: new Date().toISOString(),
          }} commentCount={threadData?.nodes.length ?? 0} />

          {threadLoading ? (
            <ThreadSkeleton />
          ) : threadError ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {(threadError as Error).message || "Unable to load thread."}
            </div>
          ) : (threadData?.nodes.length ?? 0) === 0 ? (
            <ThreadEmptyState hasFilters={roundFilter !== "all" || agentFilter !== "all"} />
          ) : (
            <ThreadList
              nodes={threadData?.nodes ?? []}
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
        </div>
      </div>

      <div className="border-t bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto w-full max-w-4xl space-y-3">
          <ModelSelectionDropdown
            selectedModels={selectedModels}
            onSelectionChange={setSelectedModels}
            disabled={!hasConfiguredOpenRouterKey || !hasPrivilegedAccess || isAiThinking}
          />
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
        leftSidebar={leftSidebar}
        centerColumn={centerColumn}
        rightSidebar={rightSidebar}
      />
      <BYOKModal open={showBYOKModal} onOpenChange={setShowBYOKModal} />
    </>
  );
};

export default Conference;
