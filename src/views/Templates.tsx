"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpDown,
  BookOpenText,
  Brain,
  Briefcase,
  Code2,
  Copy,
  Eye,
  FlaskConical,
  Folder,
  Globe2,
  Layers3,
  Megaphone,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useNavigate } from "@/lib/router";
import { AGENT_META } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { DemoBanner } from "@/components/DemoBanner";
import { Footer } from "@/components/Footer";
import { HomeIcon } from "@/components/HomeIcon";
import { TemplateDialog } from "@/components/TemplateDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useGroups } from "@/hooks/useGroups";
import {
  type Prompt,
  useCreatePrompt,
  useDeletePrompt,
  usePrompts,
} from "@/hooks/usePrompts";
import { useToast } from "@/hooks/use-toast";
import { type UserRole, useUserRole } from "@/hooks/useUserRole";
import {
  filterAndSortTemplates,
  supportsSharedTemplates,
  type TemplateRecord,
  type TemplateSort,
  type TemplateTypeFilter,
} from "./templates-marketplace-utils";

const SIDEBAR_COLLAPSE_STORAGE_KEY = "templates-sidebar-collapsed:v1";
const COVER_GRADIENTS = [
  "from-emerald-500/70 via-cyan-500/60 to-sky-600/70",
  "from-fuchsia-500/70 via-rose-500/60 to-orange-500/70",
  "from-violet-600/70 via-indigo-500/60 to-blue-600/70",
  "from-amber-500/70 via-yellow-500/60 to-orange-600/70",
  "from-teal-500/70 via-emerald-500/60 to-lime-600/70",
  "from-slate-500/70 via-zinc-600/60 to-stone-700/70",
  "from-pink-500/70 via-purple-500/60 to-indigo-600/70",
  "from-red-500/70 via-amber-500/60 to-lime-600/70",
] as const;

const AGENT_KEYWORDS = Object.values(AGENT_META).map((agent) => ({
  id: agent.id,
  name: agent.name.toLowerCase(),
}));

const hashString = (input: string) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickCoverGradient = (seed: string) =>
  COVER_GRADIENTS[hashString(seed) % COVER_GRADIENTS.length];

const getGroupIcon = (groupName: string): LucideIcon => {
  const normalized = groupName.toLowerCase();
  if (normalized.includes("marketing") || normalized.includes("brand")) return Megaphone;
  if (normalized.includes("product") || normalized.includes("design")) return Sparkles;
  if (normalized.includes("sales") || normalized.includes("business")) return Briefcase;
  if (normalized.includes("engineering") || normalized.includes("code")) return Code2;
  if (normalized.includes("research") || normalized.includes("science")) return FlaskConical;
  if (normalized.includes("team") || normalized.includes("people")) return Users;
  if (normalized.includes("strategy") || normalized.includes("analysis")) return Brain;
  if (normalized.includes("global") || normalized.includes("market")) return Globe2;
  if (normalized.includes("education") || normalized.includes("learning")) return BookOpenText;
  return Folder;
};

const toDisplayDate = (value: string) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown date";
  return new Date(parsed).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const extractAgenda = (prompt: TemplateRecord) =>
  prompt.script
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*#\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 5);

const detectAgents = (prompt: TemplateRecord) => {
  const corpus = `${prompt.title} ${prompt.description ?? ""} ${prompt.script}`.toLowerCase();
  return AGENT_KEYWORDS.filter((agent) => corpus.includes(agent.id) || corpus.includes(agent.name)).map(
    (agent) => agent.id
  );
};

const detectModeLabel = (prompt: TemplateRecord) => {
  const text = `${prompt.title} ${prompt.description ?? ""} ${prompt.script}`.toLowerCase();
  if (text.includes("debate")) return "Debate";
  if (text.includes("brainstorm")) return "Brainstorm";
  if (text.includes("roadmap")) return "Roadmap";
  if (text.includes("research")) return "Research";
  return "Roundtable";
};

const detectDurationLabel = (prompt: TemplateRecord) => {
  const matched = `${prompt.description ?? ""} ${prompt.script}`.match(
    /(\d{1,3})\s*(min|mins|minute|minutes)\b/i
  );
  if (!matched) return null;
  return `${matched[1]} min`;
};

const canCreateTemplates = (role: UserRole | undefined) =>
  role === "paid" || role === "admin" || role === "free";

const canEditTemplate = (
  prompt: TemplateRecord,
  role: UserRole | undefined,
  userId?: string
) => {
  if (!userId) return false;
  if (prompt.is_demo) return role === "admin";
  return canCreateTemplates(role) && prompt.user_id === userId;
};

const buildConferencePath = (prompt: Prompt) => {
  const params = new URLSearchParams({
    title: prompt.title,
    script: prompt.script,
  });
  if (prompt.id) {
    params.set("prompt_id", prompt.id);
  }
  return `/conference?${params.toString()}`;
};

const Templates = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: role } = useUserRole();
  const { data: groups, isLoading: groupsLoading } = useGroups();
  const { data: prompts, isLoading: promptsLoading } = usePrompts();
  const { toast } = useToast();

  const createPrompt = useCreatePrompt();
  const deletePrompt = useDeletePrompt();

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedGroup, setSelectedGroup] = useState("all");
  const [typeFilter, setTypeFilter] = useState<TemplateTypeFilter>("all");
  const [sortMode, setSortMode] = useState<TemplateSort>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<TemplateRecord | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<TemplateRecord | null>(null);
  const [mobileGroupsOpen, setMobileGroupsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(false);
  const [duplicatingPromptId, setDuplicatingPromptId] = useState<string | null>(null);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);

  const allGroups = useMemo(() => groups ?? [], [groups]);
  const templates = useMemo(() => (prompts ?? []) as TemplateRecord[], [prompts]);
  const userId = user?.id;
  const hasSharedTemplates = useMemo(
    () => supportsSharedTemplates(templates, userId),
    [templates, userId]
  );
  const canCreate = canCreateTemplates(role);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("subscribed") === "true") {
      toast({
        title: "Welcome to Professional!",
        description: "Your subscription is active. Enjoy all premium features!",
      });
      window.history.replaceState({}, "", "/templates");
    }
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === "/" && !isTextField) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    if (stored === null) {
      setSidebarCollapsed(window.matchMedia("(max-width: 1279px)").matches);
    } else {
      setSidebarCollapsed(stored === "1");
    }
    setSidebarPreferenceReady(true);
  }, []);

  useEffect(() => {
    if (!sidebarPreferenceReady) return;
    window.localStorage.setItem(
      SIDEBAR_COLLAPSE_STORAGE_KEY,
      sidebarCollapsed ? "1" : "0"
    );
  }, [sidebarCollapsed, sidebarPreferenceReady]);

  const typeFilters = useMemo(() => {
    const filters: Array<{ value: TemplateTypeFilter; label: string }> = [
      { value: "all", label: "All" },
      { value: "demo", label: "Demo" },
    ];

    if (userId) {
      filters.push({ value: "mine", label: "Mine" });
    }
    if (hasSharedTemplates) {
      filters.push({ value: "shared", label: "Shared" });
    }

    return filters;
  }, [hasSharedTemplates, userId]);

  useEffect(() => {
    if (typeFilters.some((filter) => filter.value === typeFilter)) return;
    setTypeFilter("all");
  }, [typeFilter, typeFilters]);

  const filteredTemplates = useMemo(
    () =>
      filterAndSortTemplates(templates, {
        selectedGroup,
        searchQuery,
        typeFilter,
        sort: sortMode,
        userId,
      }),
    [searchQuery, selectedGroup, sortMode, templates, typeFilter, userId]
  );

  const hasActiveFilters =
    selectedGroup !== "all" ||
    typeFilter !== "all" ||
    sortMode !== "newest" ||
    searchQuery.trim().length > 0;

  const isFirstTimeEmpty =
    !promptsLoading &&
    templates.length === 0 &&
    selectedGroup === "all" &&
    typeFilter === "all" &&
    searchQuery.trim().length === 0;

  const isFilteredEmpty =
    !promptsLoading && templates.length > 0 && filteredTemplates.length === 0;

  const clearFilters = useCallback(() => {
    setSelectedGroup("all");
    setTypeFilter("all");
    setSortMode("newest");
    setSearchQuery("");
  }, []);

  const handleStartConference = useCallback(
    (prompt: Prompt) => {
      navigate(buildConferencePath(prompt));
    },
    [navigate]
  );

  const handleUpgradeClick = useCallback(() => {
    if (!user) {
      navigate("/auth?action=subscribe");
      return;
    }

    if (role === "admin") {
      navigate("/subscribe");
      return;
    }

    if (role === "paid" || role === "free") {
      toast({
        title: "Already Subscribed",
        description:
          role === "free"
            ? "You are on a complimentary SyncTeamAI plan."
            : "You are already on the paid plan.",
      });
      return;
    }

    navigate("/auth?action=subscribe");
  }, [navigate, role, toast, user]);

  const handleDuplicate = useCallback(
    async (prompt: TemplateRecord) => {
      if (!canCreate || !userId) {
        toast({
          title: "Upgrade required",
          description: "Sign in with a paid, free, or admin tier to duplicate templates.",
          variant: "destructive",
        });
        return;
      }

      setDuplicatingPromptId(prompt.id);
      try {
        await createPrompt.mutateAsync({
          title: `${prompt.title} (Copy)`,
          description: prompt.description ?? "",
          script: prompt.script,
          group_id: prompt.group_id,
          is_demo: role === "admin" ? prompt.is_demo : false,
        });
      } finally {
        setDuplicatingPromptId(null);
      }
    },
    [canCreate, createPrompt, role, toast, userId]
  );

  const handleDelete = useCallback(
    async (prompt: TemplateRecord) => {
      if (!canEditTemplate(prompt, role, userId)) {
        toast({
          title: "Permission denied",
          description: "You do not have permission to delete this template.",
          variant: "destructive",
        });
        return;
      }

      setDeletingPromptId(prompt.id);
      try {
        await deletePrompt.mutateAsync(prompt.id);
      } finally {
        setDeletingPromptId(null);
      }
    },
    [deletePrompt, role, toast, userId]
  );

  const previewAgenda = useMemo(
    () => (previewPrompt ? extractAgenda(previewPrompt) : []),
    [previewPrompt]
  );
  const previewAgents = useMemo(
    () => (previewPrompt ? detectAgents(previewPrompt) : []),
    [previewPrompt]
  );

  const groupNameLookup = useMemo(() => {
    const map = new Map<string, string>();
    allGroups.forEach((group) => map.set(group.id, group.name));
    return map;
  }, [allGroups]);

  const renderGroupButton = ({
    groupId,
    label,
    compact,
    isAllOption = false,
  }: {
    groupId: string;
    label: string;
    compact: boolean;
    isAllOption?: boolean;
  }) => {
    const active = selectedGroup === groupId;
    const Icon = isAllOption ? Layers3 : getGroupIcon(label);
    const button = (
      <button
        type="button"
        key={groupId}
        aria-pressed={active}
        onClick={() => {
          setSelectedGroup(groupId);
          setMobileGroupsOpen(false);
        }}
        className={cn(
          "group relative flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          compact ? "justify-center px-2" : "gap-3",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {active ? (
          <span className="absolute left-0 top-1.5 h-6 w-1 rounded-r bg-primary" aria-hidden="true" />
        ) : null}
        <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        {compact ? null : <span className="truncate">{label}</span>}
      </button>
    );

    if (!compact) {
      return button;
    }

    return (
      <Tooltip key={groupId}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  };

  const GroupsSidebar = ({ mobile }: { mobile: boolean }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className={cn("text-sm font-semibold", !mobile && sidebarCollapsed && "sr-only")}>Groups</h2>
        {!mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={sidebarCollapsed ? "Expand groups sidebar" : "Collapse groups sidebar"}
            onClick={() => setSidebarCollapsed((previous) => !previous)}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        ) : null}
      </div>

      <ScrollArea className={cn(mobile ? "h-[65vh]" : "h-[calc(100vh-13rem)]")}>
        <TooltipProvider delayDuration={120}>
          <div className="space-y-1 pr-2">
            {renderGroupButton({
              groupId: "all",
              label: "All Groups",
              compact: !mobile && sidebarCollapsed,
              isAllOption: true,
            })}
            {groupsLoading ? (
              <>
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton
                    key={`group-skeleton-${index}`}
                    className={cn("h-9", sidebarCollapsed && !mobile ? "w-9 rounded-lg" : "w-full")}
                  />
                ))}
              </>
            ) : (
              allGroups.map((group) =>
                renderGroupButton({
                  groupId: group.id,
                  label: group.name,
                  compact: !mobile && sidebarCollapsed,
                })
              )
            )}
          </div>
        </TooltipProvider>
      </ScrollArea>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="flex gap-6">
          <aside
            className={cn(
              "sticky top-6 hidden self-start rounded-xl border bg-card p-3 md:block",
              sidebarCollapsed ? "w-20" : "w-72"
            )}
          >
            <GroupsSidebar mobile={false} />
          </aside>

          <main className="min-w-0 flex-1 space-y-6">
            <header className="space-y-5 rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <HomeIcon />
                  <Sheet open={mobileGroupsOpen} onOpenChange={setMobileGroupsOpen}>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="md:hidden"
                        aria-label="Open groups sidebar"
                      >
                        <PanelLeft className="h-4 w-4" />
                        Groups
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[88vw] sm:max-w-sm" aria-label="Template groups">
                      <SheetHeader className="pb-4">
                        <SheetTitle>Groups</SheetTitle>
                        <SheetDescription>Filter templates by category.</SheetDescription>
                      </SheetHeader>
                      <GroupsSidebar mobile />
                    </SheetContent>
                  </Sheet>
                </div>
              </div>

              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Browse Templates</h1>
                  <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                    Choose a template to start your AI conference
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => setCreateDialogOpen(true)}
                    disabled={!canCreate}
                    className="min-w-36"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Template
                  </Button>
                  <Button
                    type="button"
                    variant={role === "paid" || role === "free" ? "secondary" : "outline"}
                    onClick={handleUpgradeClick}
                    disabled={role === "paid" || role === "free"}
                    className="min-w-44"
                  >
                    {role === "paid" || role === "free" ? "Subscribed" : "Upgrade to Pro $20/mo"}
                  </Button>
                </div>
              </div>

              {!user ? <DemoBanner /> : null}
            </header>

            <section className="space-y-4 rounded-xl border bg-card p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_220px_220px]">
                <div className="relative">
                  <Label htmlFor="templates-search" className="sr-only">
                    Search templates
                  </Label>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="templates-search"
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search templates by title, tags, agents..."
                    className="pl-9"
                  />
                </div>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger aria-label="Filter templates by group">
                    <SelectValue placeholder="All Groups" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Groups</SelectItem>
                    {allGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortMode} onValueChange={(value: TemplateSort) => setSortMode(value)}>
                  <SelectTrigger aria-label="Sort templates">
                    <ArrowUpDown className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="Newest" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {typeFilters.map((filter) => (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant={typeFilter === filter.value ? "default" : "outline"}
                      onClick={() => setTypeFilter(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {filteredTemplates.length} result{filteredTemplates.length === 1 ? "" : "s"}
                  </span>
                  {hasActiveFilters ? (
                    <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            {promptsLoading ? (
              <section className="grid gap-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={`template-loading-${index}`} className="rounded-xl border bg-card p-4">
                    <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                      <Skeleton className="h-36 w-full rounded-lg" />
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                        <div className="flex gap-2 pt-1">
                          <Skeleton className="h-9 w-36" />
                          <Skeleton className="h-9 w-24" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ) : null}

            {isFirstTimeEmpty ? (
              <section className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
                <h2 className="text-xl font-semibold">Create your first template</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Start a reusable conference blueprint and launch sessions in one click.
                </p>
                <Button
                  type="button"
                  className="mt-5"
                  onClick={() => setCreateDialogOpen(true)}
                  disabled={!canCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first template
                </Button>
              </section>
            ) : null}

            {isFilteredEmpty ? (
              <section className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
                <h2 className="text-xl font-semibold">No templates found</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a different search term or clear the active filters.
                </p>
                <Button type="button" variant="outline" className="mt-5" onClick={clearFilters}>
                  Clear filters
                </Button>
              </section>
            ) : null}

            {!promptsLoading && filteredTemplates.length > 0 ? (
              <section className="grid gap-4">
                {filteredTemplates.map((prompt) => {
                  const canEdit = canEditTemplate(prompt, role, userId);
                  const groupLabel = groupNameLookup.get(prompt.group_id ?? "") ?? "Uncategorized";
                  const coverSeed = `${groupLabel}-${prompt.title}`;
                  const gradientClass = pickCoverGradient(coverSeed);
                  const agents = detectAgents(prompt);
                  const modeLabel = detectModeLabel(prompt);
                  const durationLabel = detectDurationLabel(prompt);
                  const visibilityLabel = prompt.is_demo
                    ? "Demo"
                    : prompt.user_id === userId
                    ? "Private"
                    : "Shared";

                  return (
                    <article
                      key={prompt.id}
                      className="group rounded-xl border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-primary/40"
                    >
                      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
                        <div className="overflow-hidden rounded-lg border bg-muted/40">
                          <AspectRatio ratio={16 / 9}>
                            {prompt.image_url ? (
                              <img
                                src={prompt.image_url}
                                alt={`${prompt.title} cover`}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            ) : (
                              <div
                                className={cn(
                                  "relative flex h-full w-full items-end bg-gradient-to-br p-4 text-white transition-transform duration-500 group-hover:scale-105",
                                  gradientClass
                                )}
                              >
                                <div className="absolute inset-0 bg-black/15" />
                                <div className="relative flex items-center gap-2 text-sm font-medium">
                                  <Sparkles className="h-4 w-4" />
                                  <span className="truncate">{groupLabel}</span>
                                </div>
                              </div>
                            )}
                          </AspectRatio>
                        </div>

                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={prompt.is_demo ? "default" : "secondary"}>{visibilityLabel}</Badge>
                              <Badge variant="outline">{groupLabel}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">{toDisplayDate(prompt.created_at)}</span>
                          </div>

                          <div>
                            <h3 className="text-xl font-semibold leading-tight">{prompt.title}</h3>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                              {prompt.description || "No description provided."}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {agents.length > 0 ? (
                              <Badge variant="outline">{agents.length} AI Agents</Badge>
                            ) : (
                              <Badge variant="outline">Agent-ready</Badge>
                            )}
                            <Badge variant="outline">{modeLabel}</Badge>
                            {durationLabel ? <Badge variant="outline">{durationLabel}</Badge> : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" onClick={() => handleStartConference(prompt)}>
                              <Play className="mr-2 h-4 w-4" />
                              Start Conference
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setPreviewPrompt(prompt)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              Preview
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`More actions for ${prompt.title}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={!canCreate || duplicatingPromptId === prompt.id}
                                  onSelect={() => {
                                    void handleDuplicate(prompt);
                                  }}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={!canEdit}
                                  onSelect={() => setEditingPrompt(prompt)}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={!canEdit || deletingPromptId === prompt.id}
                                  className="text-destructive focus:text-destructive"
                                  onSelect={() => {
                                    void handleDelete(prompt);
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : null}
          </main>
        </div>
      </div>

      <TemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        groups={allGroups}
        userRole={role}
      />

      <TemplateDialog
        open={Boolean(editingPrompt)}
        onOpenChange={(open) => {
          if (!open) setEditingPrompt(null);
        }}
        groups={allGroups}
        userRole={role}
        existingPrompt={editingPrompt ?? undefined}
      />

      <Sheet
        open={Boolean(previewPrompt)}
        onOpenChange={(open) => {
          if (!open) setPreviewPrompt(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-[96vw] overflow-y-auto sm:max-w-2xl"
          aria-label="Template preview panel"
        >
          {previewPrompt ? (
            <>
              <SheetHeader>
                <div className="flex flex-wrap items-center gap-2 pb-1">
                  <Badge variant={previewPrompt.is_demo ? "default" : "secondary"}>
                    {previewPrompt.is_demo ? "Demo" : "Template"}
                  </Badge>
                  <Badge variant="outline">
                    {groupNameLookup.get(previewPrompt.group_id ?? "") ?? "Uncategorized"}
                  </Badge>
                </div>
                <SheetTitle>{previewPrompt.title}</SheetTitle>
                <SheetDescription>
                  {previewPrompt.description || "No description provided."}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold">Agent roster</h3>
                  {previewAgents.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {previewAgents.map((agentId) => {
                        const meta = AGENT_META[agentId];
                        if (!meta) return null;
                        return (
                          <div key={agentId} className="flex items-center gap-2">
                            <Avatar className="h-8 w-8 border">
                              <AvatarFallback>{meta.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="text-sm">
                              <p className="font-medium">{meta.name}</p>
                              <p className="text-xs text-muted-foreground">{meta.roleLabel}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Agent assignments will be set from your active model lineup.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold">Agenda outline</h3>
                  {previewAgenda.length > 0 ? (
                    <ol className="mt-3 space-y-2 text-sm">
                      {previewAgenda.map((line, index) => (
                        <li key={`${line}-${index}`} className="flex gap-2">
                          <span className="mt-0.5 text-xs text-muted-foreground">{index + 1}.</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No explicit agenda found. Open the script to refine the sequence.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/20 p-4">
                  <h3 className="text-sm font-semibold">Script preview</h3>
                  <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
                    {previewPrompt.script}
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    handleStartConference(previewPrompt);
                    setPreviewPrompt(null);
                  }}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start Conference
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Footer />
    </div>
  );
};

export default Templates;
