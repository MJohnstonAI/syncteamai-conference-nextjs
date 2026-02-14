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

const getGroupAccentClass = (groupName: string) => {
  const normalized = groupName.toLowerCase();
  if (normalized.includes("marketing") || normalized.includes("brand")) return "text-pink-500";
  if (normalized.includes("product") || normalized.includes("design")) return "text-violet-500";
  if (normalized.includes("sales") || normalized.includes("business")) return "text-amber-500";
  if (normalized.includes("engineering") || normalized.includes("code")) return "text-indigo-500";
  if (normalized.includes("research") || normalized.includes("science")) return "text-teal-500";
  if (normalized.includes("team") || normalized.includes("people")) return "text-sky-500";
  if (normalized.includes("strategy") || normalized.includes("analysis")) return "text-blue-500";
  if (normalized.includes("global") || normalized.includes("market")) return "text-cyan-500";
  if (normalized.includes("education") || normalized.includes("learning")) return "text-emerald-500";
  return "text-slate-500";
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

const buildConfigurePath = (prompt: Prompt) => {
  const params = new URLSearchParams();
  if (prompt.id) {
    params.set("templateId", prompt.id);
  }
  return `/configure?${params.toString()}`;
};

const Templates = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
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

  const handleConfigurePanel = useCallback(
    (prompt: Prompt) => {
      navigate(buildConfigurePath(prompt));
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

  const headerAuthTarget = "/auth";
  const headerAuthLabel = "Sign-in";
  const requiresAuth = !loading && !user;

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
          "templates-micro-badge group relative flex w-full items-center rounded-full px-4 py-2.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          compact ? "justify-center px-2.5" : "gap-3 text-left",
          active ? "templates-pill-active" : "text-slate-600 hover:bg-white/90 hover:text-slate-900"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            active ? "text-white" : getGroupAccentClass(label)
          )}
        />
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

  const GroupsSidebar = ({ mobile }: { mobile: boolean }) => {
    const groupList = (
      <TooltipProvider delayDuration={120}>
        <div className="space-y-2 pr-2">
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
                  className={cn("h-10 rounded-full", sidebarCollapsed && !mobile ? "w-10" : "w-full")}
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
    );

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className={cn("templates-kicker", !mobile && sidebarCollapsed && "sr-only")}>Collections</h2>
          {!mobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={sidebarCollapsed ? "Expand groups sidebar" : "Collapse groups sidebar"}
              onClick={() => setSidebarCollapsed((previous) => !previous)}
              className="h-9 w-9 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          ) : null}
        </div>

        {mobile ? <ScrollArea className="h-[65vh]">{groupList}</ScrollArea> : groupList}
      </div>
    );
  };

  if (requiresAuth) {
    return (
      <div className="templates-shell min-h-screen" data-templates-page>
        <div className="mx-auto w-full max-w-[1120px] px-4 pb-12 pt-6 sm:px-6 lg:px-10">
          <main className="space-y-7">
            <header className="templates-panel rounded-[1.75rem] p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <HomeIcon />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(headerAuthTarget)}
                  className="h-10 shrink-0 rounded-full border-slate-200 bg-white/95 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50"
                >
                  {headerAuthLabel}
                </Button>
              </div>
              <div className="mt-5 space-y-3">
                <p className="templates-kicker flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  Marketplace
                </p>
                <h1 className="templates-serif text-4xl leading-[1.02] text-slate-900 sm:text-5xl dark:text-slate-100">
                  Sign in to access your <span className="templates-hero-gradient">Templates</span>
                </h1>
                <p className="templates-text-muted max-w-2xl text-base leading-relaxed sm:text-lg">
                  Templates are protected by row-level security. Sign in before browsing, creating, or configuring
                  template workflows.
                </p>
              </div>
            </header>

            <section className="templates-panel rounded-2xl border-dashed p-10 text-center">
              <h2 className="templates-serif text-2xl font-semibold text-slate-900 dark:text-slate-100">
                Authentication required
              </h2>
              <p className="templates-text-muted mt-2 text-sm">
                You need an active account session to load your template library.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  type="button"
                  onClick={() => navigate("/auth")}
                  className="templates-primary-cta rounded-full px-6 text-xs font-bold uppercase tracking-[0.1em] hover:opacity-95"
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="rounded-full border-slate-200 px-6 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 hover:bg-slate-50"
                >
                  Back Home
                </Button>
              </div>
            </section>
          </main>
        </div>

        <Footer />
      </div>
    );
  }

  return (
    <div className="templates-shell min-h-screen" data-templates-page>
      <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 lg:px-10">
        <div className="flex gap-8">
          <aside
            className={cn(
              "templates-glass-sidebar templates-panel sticky top-6 hidden self-start rounded-3xl p-4 md:block",
              sidebarCollapsed ? "w-24" : "w-72"
            )}
          >
            <GroupsSidebar mobile={false} />
          </aside>

          <main className="min-w-0 flex-1 space-y-7">
            <header className="templates-panel rounded-[1.75rem] p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <HomeIcon />
                  <Sheet open={mobileGroupsOpen} onOpenChange={setMobileGroupsOpen}>
                    <SheetTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full border-slate-200 bg-white px-4 text-xs font-semibold uppercase tracking-[0.1em] text-slate-600 md:hidden"
                        aria-label="Open groups sidebar"
                      >
                        <PanelLeft className="h-4 w-4" />
                        Groups
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-[88vw] bg-[#f8f9fb] sm:max-w-sm" aria-label="Template groups">
                      <SheetHeader className="pb-4">
                        <SheetTitle className="templates-serif">Groups</SheetTitle>
                        <SheetDescription>Filter templates by category.</SheetDescription>
                      </SheetHeader>
                      <GroupsSidebar mobile />
                    </SheetContent>
                  </Sheet>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(headerAuthTarget)}
                  className="h-10 shrink-0 rounded-full border-slate-200 bg-white/95 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50"
                >
                  {headerAuthLabel}
                </Button>
              </div>

              <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <p className="templates-kicker flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Marketplace
                  </p>
                  <h1 className="templates-serif text-4xl leading-[1.02] text-slate-900 sm:text-5xl md:text-6xl dark:text-slate-100">
                    Browse <span className="templates-hero-gradient">Templates</span>
                  </h1>
                  <p className="templates-text-muted max-w-2xl text-base leading-relaxed sm:text-lg">
                    Choose a template to configure your AI panel
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 pb-1">
                  <Button
                    type="button"
                    onClick={() => setCreateDialogOpen(true)}
                    disabled={!canCreate}
                    className="templates-primary-cta h-11 min-w-40 rounded-full px-6 text-xs font-bold uppercase tracking-[0.1em] hover:opacity-95"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Template
                  </Button>
                  <Button
                    type="button"
                    variant={role === "paid" || role === "free" ? "secondary" : "outline"}
                    onClick={handleUpgradeClick}
                    disabled={role === "paid" || role === "free"}
                    className="h-11 min-w-48 rounded-full border-slate-200 bg-white/95 px-6 text-xs font-semibold uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50"
                  >
                    {role === "paid" || role === "free" ? "Subscribed" : "Upgrade to Pro $20/mo"}
                  </Button>
                </div>
              </div>

            </header>

            <section className="templates-panel space-y-5 rounded-[1.5rem] p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_220px_220px]">
                <div className="relative">
                  <Label htmlFor="templates-search" className="sr-only">
                    Search templates
                  </Label>
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="templates-search"
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search templates by title, tags, agents..."
                    className="h-11 rounded-full border-slate-200 bg-white pl-11 text-sm"
                  />
                </div>
                <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                  <SelectTrigger aria-label="Filter templates by group" className="h-11 rounded-full border-slate-200 bg-white">
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
                  <SelectTrigger aria-label="Sort templates" className="h-11 rounded-full border-slate-200 bg-white">
                    <ArrowUpDown className="mr-2 h-4 w-4 text-slate-500" />
                    <SelectValue placeholder="Newest" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
                  {typeFilters.map((filter) => (
                    <Button
                      key={filter.value}
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setTypeFilter(filter.value)}
                      className={cn(
                        "rounded-full px-4 text-xs font-semibold uppercase tracking-[0.1em]",
                        typeFilter === filter.value
                          ? "templates-pill-active hover:opacity-95"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      )}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="templates-text-muted text-xs font-medium uppercase tracking-[0.1em]">
                    {filteredTemplates.length} result{filteredTemplates.length === 1 ? "" : "s"}
                  </span>
                  {hasActiveFilters ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={clearFilters}
                      className="rounded-full text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    >
                      Clear filters
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            {promptsLoading ? (
              <section className="grid gap-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={`template-loading-${index}`} className="templates-panel rounded-2xl p-3">
                    <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                      <Skeleton className="h-44 w-full rounded-xl" />
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
              <section className="templates-panel rounded-2xl border-dashed p-10 text-center">
                <h2 className="templates-serif text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  Create your first template
                </h2>
                <p className="templates-text-muted mt-2 text-sm">
                  Start a reusable conference blueprint and launch sessions in one click.
                </p>
                <Button
                  type="button"
                  className="templates-primary-cta mt-5 rounded-full px-6 text-xs font-bold uppercase tracking-[0.1em]"
                  onClick={() => setCreateDialogOpen(true)}
                  disabled={!canCreate}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create your first template
                </Button>
              </section>
            ) : null}

            {isFilteredEmpty ? (
              <section className="templates-panel rounded-2xl border-dashed p-10 text-center">
                <h2 className="templates-serif text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  No templates found
                </h2>
                <p className="templates-text-muted mt-2 text-sm">
                  Try a different search term or clear the active filters.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-5 rounded-full border-slate-200 px-5 text-xs font-semibold uppercase tracking-[0.1em]"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </section>
            ) : null}

            {!promptsLoading && filteredTemplates.length > 0 ? (
              <section className="grid gap-5">
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
                      className="group templates-panel rounded-2xl p-2.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-within:ring-2 focus-within:ring-primary/35 md:p-3"
                    >
                      <div className="flex flex-col gap-5 md:flex-row md:items-stretch">
                        <div className="templates-inset-cover relative w-full overflow-hidden rounded-xl bg-slate-100 md:w-[260px] md:flex-shrink-0">
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
                                <div className="relative flex items-center gap-2">
                                  <span className="templates-micro-badge inline-flex rounded-md bg-white/85 px-2 py-1 text-[10px] text-slate-900">
                                    {groupLabel}
                                  </span>
                                </div>
                              </div>
                            )}
                          </AspectRatio>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/45 to-transparent px-4 py-3">
                            <div className="flex items-center gap-2 text-white/90">
                              <Sparkles className="h-4 w-4" />
                              <span className="text-xs font-semibold tracking-wide">
                                {durationLabel ?? "Agent-ready"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col justify-center space-y-3 py-2 pr-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "templates-micro-badge rounded-full px-3 py-1 text-[10px]",
                                  prompt.is_demo
                                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                                    : "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200"
                                )}
                              >
                                {visibilityLabel}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="templates-micro-badge rounded-full border-slate-200 px-3 py-1 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                              >
                                {groupLabel}
                              </Badge>
                            </div>
                            <span className="templates-text-muted text-xs font-medium uppercase tracking-[0.1em]">
                              {toDisplayDate(prompt.created_at)}
                            </span>
                          </div>

                          <div>
                            <h3 className="templates-serif text-3xl leading-tight text-slate-900 transition-colors duration-300 group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-300">
                              {prompt.title}
                            </h3>
                            <p className="templates-text-muted mt-2 line-clamp-2 text-sm leading-relaxed">
                              {prompt.description || "No description provided."}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {agents.length > 0 ? (
                              <Badge
                                variant="outline"
                                className="templates-micro-badge rounded-full border-slate-200 px-3 py-1 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                              >
                                {agents.length} AI Agents
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="templates-micro-badge rounded-full border-slate-200 px-3 py-1 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                              >
                                Agent-ready
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className="templates-micro-badge rounded-full border-slate-200 px-3 py-1 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                            >
                              {modeLabel}
                            </Badge>
                            {durationLabel ? (
                              <Badge
                                variant="outline"
                                className="templates-micro-badge rounded-full border-slate-200 px-3 py-1 text-[10px] text-slate-600 dark:border-slate-600 dark:text-slate-300"
                              >
                                {durationLabel}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pt-1">
                            <Button
                              type="button"
                              onClick={() => handleConfigurePanel(prompt)}
                              className="templates-primary-cta rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.12em] hover:opacity-95"
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Configure AI Panel
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setPreviewPrompt(prompt)}
                              className="rounded-full border-slate-200 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
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
                                  className="rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-slate-100"
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
                    handleConfigurePanel(previewPrompt);
                    setPreviewPrompt(null);
                  }}
                >
                  <Play className="mr-2 h-4 w-4" />
                  Configure AI Panel
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
