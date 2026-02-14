"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  FolderOpen,
  Play,
  Search,
  Trash2,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { HomeIcon } from "@/components/HomeIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import {
  type Conversation,
  useConversationsPage,
  useDeleteConversation,
} from "@/hooks/useConversations";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "@/lib/router";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;
const PAGE_WINDOW = 5;

const parsePageParam = (rawValue: string | null) => {
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const toDateLabel = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "--";
  return new Date(parsed).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const toTimeLabel = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "--";
  return new Date(parsed).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const scriptPreview = (conversation: Conversation) => {
  const source = conversation.script?.replace(/\s+/g, " ").trim();
  if (!source) {
    return "No agenda script saved. This session was started with a direct conference prompt.";
  }
  if (source.length <= 220) return source;
  return `${source.slice(0, 220)}...`;
};

const Sessions = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const deleteConversation = useDeleteConversation();

  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [page, setPage] = useState(() => parsePageParam(searchParams.get("page")));
  const [highlightConversationId] = useState(() => searchParams.get("conversation_id"));
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, navigate, user]);

  const normalizedSearch = searchQuery.trim();
  const {
    data,
    isLoading,
    isFetching,
    error,
  } = useConversationsPage({
    page,
    pageSize: PAGE_SIZE,
    searchQuery: normalizedSearch,
  });

  const conversations = data?.conversations ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const currentSearch = searchParams.toString();
  useEffect(() => {
    const nextParams = new URLSearchParams();
    if (normalizedSearch) {
      nextParams.set("q", normalizedSearch);
    }
    if (page > 1) {
      nextParams.set("page", String(page));
    }
    if (highlightConversationId) {
      nextParams.set("conversation_id", highlightConversationId);
    }

    const nextSearch = nextParams.toString();
    if (nextSearch === currentSearch) return;
    setSearchParams(nextParams, { replace: true, scroll: false });
  }, [
    currentSearch,
    highlightConversationId,
    normalizedSearch,
    page,
    setSearchParams,
  ]);

  const visiblePages = useMemo(() => {
    if (totalPages <= PAGE_WINDOW) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const halfWindow = Math.floor(PAGE_WINDOW / 2);
    let start = Math.max(1, page - halfWindow);
    const end = Math.min(totalPages, start + PAGE_WINDOW - 1);

    if (end - start + 1 < PAGE_WINDOW) {
      start = Math.max(1, end - PAGE_WINDOW + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [page, totalPages]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      setDeletingId(conversationId);
      try {
        await deleteConversation.mutateAsync(conversationId);
        toast({
          title: "Session deleted",
          description: "The session has been removed from your vault.",
        });

        if (conversations.length === 1 && page > 1) {
          setPage((previous) => Math.max(1, previous - 1));
        }
      } catch (deleteError) {
        const message =
          deleteError instanceof Error ? deleteError.message : "Failed to delete session.";
        toast({
          title: "Delete failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setDeletingId(null);
      }
    },
    [conversations.length, deleteConversation, page, toast]
  );

  if (!user) {
    return null;
  }

  return (
    <div className="sessions-shell min-h-screen" data-sessions-page>
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-12 pt-6 sm:px-6 lg:px-10">
        <main className="space-y-6">
          <header className="sessions-panel rounded-[1.75rem] p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <HomeIcon />
                <div>
                  <p className="sessions-kicker">Session Vault</p>
                  <h1 className="font-[var(--font-playfair)] text-3xl font-semibold text-slate-900 dark:text-slate-100 sm:text-4xl">
                    Conference Sessions
                  </h1>
                  <p className="sessions-text-muted mt-1 text-sm">
                    Browse saved sessions, search by title, and resume discussion instantly.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-slate-200 px-4 text-xs font-semibold uppercase tracking-[0.08em] dark:border-slate-600"
                  onClick={() => navigate("/templates")}
                >
                  Templates
                </Button>
                <Button
                  type="button"
                  className="sessions-primary-cta rounded-full px-4 text-xs font-semibold uppercase tracking-[0.08em]"
                  onClick={() => navigate("/conference")}
                >
                  Conference
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search sessions by title..."
                  className="h-11 rounded-xl border-slate-200 pl-10 dark:border-slate-600 dark:bg-[#161d2c]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="sessions-micro-badge rounded-full px-3 py-1">
                  {totalCount} session{totalCount === 1 ? "" : "s"}
                </Badge>
                {isFetching && !isLoading ? (
                  <Badge variant="secondary" className="sessions-micro-badge rounded-full px-3 py-1">
                    Refreshing
                  </Badge>
                ) : null}
              </div>
            </div>
          </header>

          {error ? (
            <section className="sessions-panel rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {(error as Error).message || "Unable to load sessions."}
            </section>
          ) : null}

          {isLoading ? (
            <section className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`session-loading-${index}`} className="sessions-panel rounded-2xl p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-8 w-3/4" />
                  <Skeleton className="mt-3 h-14 w-full" />
                  <div className="mt-4 flex gap-2">
                    <Skeleton className="h-9 w-28" />
                    <Skeleton className="h-9 w-20" />
                  </div>
                </div>
              ))}
            </section>
          ) : conversations.length === 0 ? (
            <section className="sessions-panel rounded-2xl border-dashed p-10 text-center">
              <h2 className="font-[var(--font-playfair)] text-2xl font-semibold text-slate-900 dark:text-slate-100">
                No sessions found
              </h2>
              <p className="sessions-text-muted mt-2 text-sm">
                {normalizedSearch
                  ? "Try a different search query."
                  : "Start a conference from Templates and it will appear here."}
              </p>
              {normalizedSearch ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 rounded-full px-5 text-xs font-semibold uppercase tracking-[0.08em]"
                  onClick={() => {
                    setSearchQuery("");
                    setPage(1);
                  }}
                >
                  Clear search
                </Button>
              ) : (
                <Button
                  type="button"
                  className="sessions-primary-cta mt-5 rounded-full px-5 text-xs font-semibold uppercase tracking-[0.08em]"
                  onClick={() => navigate("/templates")}
                >
                  Open Templates
                </Button>
              )}
            </section>
          ) : (
            <section className="grid gap-4 lg:grid-cols-2">
              {conversations.map((conversation) => (
                <article
                  key={conversation.id}
                  className={cn(
                    "sessions-panel rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
                    highlightConversationId === conversation.id
                      ? "ring-2 ring-primary/45 ring-offset-2 ring-offset-transparent"
                      : null
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <Badge
                        variant={conversation.prompt_script_id ? "secondary" : "outline"}
                        className="sessions-micro-badge rounded-full px-3 py-1"
                      >
                        {conversation.prompt_script_id ? "Template Session" : "Direct Session"}
                      </Badge>
                      <Badge variant="outline" className="sessions-micro-badge rounded-full px-3 py-1">
                        {conversation.id.slice(0, 8)}
                      </Badge>
                    </div>
                    <FolderOpen className="h-4 w-4 text-indigo-500 dark:text-indigo-300" />
                  </div>

                  <h2 className="mt-3 font-[var(--font-playfair)] text-2xl font-semibold leading-tight text-slate-900 dark:text-slate-100">
                    {conversation.title}
                  </h2>

                  <p className="sessions-text-muted mt-2 line-clamp-3 text-sm leading-relaxed">
                    {scriptPreview(conversation)}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Updated {toDateLabel(conversation.updated_at)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {toTimeLabel(conversation.updated_at)}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      className="sessions-primary-cta rounded-full px-4 text-xs font-semibold uppercase tracking-[0.08em]"
                      onClick={() => navigate(`/conference?conversation_id=${conversation.id}`)}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Resume
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full px-4 text-xs font-semibold uppercase tracking-[0.08em]"
                      onClick={() => {
                        void handleDeleteConversation(conversation.id);
                      }}
                      disabled={deletingId === conversation.id}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {deletingId === conversation.id ? "Deleting" : "Delete"}
                    </Button>
                  </div>
                </article>
              ))}
            </section>
          )}

          <footer className="sessions-panel rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="sessions-text-muted text-xs font-medium uppercase tracking-[0.08em]">
                Page {page} of {totalPages}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                  disabled={page <= 1}
                  className="rounded-full"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Prev
                </Button>
                {visiblePages[0] > 1 ? (
                  <>
                    <Button
                      type="button"
                      variant={page === 1 ? "default" : "outline"}
                      size="sm"
                      className="min-w-9 rounded-full"
                      onClick={() => setPage(1)}
                    >
                      1
                    </Button>
                    {visiblePages[0] > 2 ? (
                      <span className="px-1 text-xs text-slate-400">...</span>
                    ) : null}
                  </>
                ) : null}
                {visiblePages.map((pageNumber) => (
                  <Button
                    key={pageNumber}
                    type="button"
                    variant={page === pageNumber ? "default" : "outline"}
                    size="sm"
                    className="min-w-9 rounded-full"
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                ))}
                {visiblePages[visiblePages.length - 1] < totalPages ? (
                  <>
                    {visiblePages[visiblePages.length - 1] < totalPages - 1 ? (
                      <span className="px-1 text-xs text-slate-400">...</span>
                    ) : null}
                    <Button
                      type="button"
                      variant={page === totalPages ? "default" : "outline"}
                      size="sm"
                      className="min-w-9 rounded-full"
                      onClick={() => setPage(totalPages)}
                    >
                      {totalPages}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                  disabled={page >= totalPages}
                  className="rounded-full"
                >
                  Next
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </footer>
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default Sessions;
