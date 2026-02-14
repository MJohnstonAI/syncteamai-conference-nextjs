import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { OPENROUTER_MODELS, getModelById } from "@/data/openRouterModels";
import type {
  BehaviorArchetype,
  ExpertPriority,
  ExpertRole,
  ResponseLength,
} from "@/lib/configuration/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type AgentOption = {
  avatarId: string;
  label: string;
  modelLabel: string;
  active: boolean;
};

type ExpertCustomizerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentOption[];
  selectedAvatarId: string | null;
  onSelectAvatarId: (avatarId: string) => void;
  draftRole: ExpertRole | null;
  onDraftRoleChange: (nextRole: ExpertRole) => void;
  onSave: () => void;
  onReset: () => void;
  onToggleActive: (avatarId: string, active: boolean) => void;
  disableSave?: boolean;
};

const ARCHETYPE_OPTIONS: Array<{ value: BehaviorArchetype; label: string }> = [
  { value: "analytical", label: "Analytical" },
  { value: "strategic", label: "Strategic" },
  { value: "adversarial", label: "Adversarial" },
  { value: "integrative", label: "Integrative" },
  { value: "creative", label: "Creative" },
];

const RESPONSE_LENGTH_OPTIONS: Array<{ value: ResponseLength; label: string }> = [
  { value: "concise", label: "Concise" },
  { value: "medium", label: "Medium" },
  { value: "comprehensive", label: "Comprehensive" },
];

const PRIORITY_OPTIONS: Array<{ value: ExpertPriority; label: string }> = [
  { value: "critical", label: "Critical" },
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
];

const toDisplayNameFromModelId = (modelId: string): string => {
  const suffix = modelId.split("/")[1] ?? modelId;
  const normalized = suffix.replace(/[-_]+/g, " ").trim();
  if (!normalized) return "OpenRouter Model";
  return normalized
    .split(" ")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
};

const splitToList = (value: string, maxItems: number): string[] =>
  value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, maxItems);

export default function ExpertCustomizerSheet({
  open,
  onOpenChange,
  agents,
  selectedAvatarId,
  onSelectAvatarId,
  draftRole,
  onDraftRoleChange,
  onSave,
  onReset,
  onToggleActive,
  disableSave = false,
}: ExpertCustomizerSheetProps) {
  const modelOptions = useMemo(() => {
    const base = OPENROUTER_MODELS
      .map((model) => ({
        id: model.id,
        label: `${model.name} (${model.provider})`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));

    if (!draftRole?.model?.modelId) {
      return base;
    }

    const currentModelId = draftRole.model.modelId.trim();
    if (!currentModelId || base.some((option) => option.id === currentModelId)) {
      return base;
    }

    return [
      {
        id: currentModelId,
        label: `${draftRole.model.displayName || toDisplayNameFromModelId(currentModelId)} (custom)`,
      },
      ...base,
    ];
  }, [draftRole?.model.displayName, draftRole?.model.modelId]);

  const selectedAgent = agents.find((agent) => agent.avatarId === selectedAvatarId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-slate-950/65 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <aside className="fixed inset-y-0 left-0 z-[81] h-full w-full max-w-[760px] border-r border-indigo-500/30 bg-[#1a1530] text-slate-100 shadow-2xl">
        <div className="flex h-full min-h-0 flex-col">
          <header className="border-b border-white/10 px-6 py-5 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-[var(--font-playfair)] text-4xl text-white">
                  Customize Pack
                </h2>
                <p className="mt-1 text-base text-slate-300">
                  Refine role definitions and interaction models for next rounds.
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Core Roles
                </h3>
                <p className="text-xs text-slate-400">
                  {agents.filter((agent) => agent.active).length} active
                </p>
              </div>
              <div className="space-y-2">
                {agents.map((agent) => (
                  <button
                    key={agent.avatarId}
                    type="button"
                    onClick={() => onSelectAvatarId(agent.avatarId)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      selectedAvatarId === agent.avatarId
                        ? "border-indigo-400 bg-indigo-500/20"
                        : "border-white/10 bg-[#221b3d] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{agent.label}</p>
                        <p className="truncate text-xs text-slate-300">{agent.modelLabel}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-200">
                          {agent.active ? "active" : "disabled"}
                        </Badge>
                        <Switch
                          checked={agent.active}
                          onCheckedChange={(checked) => onToggleActive(agent.avatarId, checked)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6 space-y-4 rounded-xl border border-indigo-500/35 bg-[#15112a] p-4">
              {!draftRole || !selectedAgent ? (
                <p className="text-sm text-slate-300">Select an expert to customize.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Role Title</Label>
                    <Input
                      value={draftRole.title}
                      onChange={(event) =>
                        onDraftRoleChange({
                          ...draftRole,
                          title: event.target.value.slice(0, 120),
                        })
                      }
                      className="border-white/15 bg-[#251d44] text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Role Category</Label>
                    <Input
                      value={draftRole.category}
                      onChange={(event) =>
                        onDraftRoleChange({
                          ...draftRole,
                          category: event.target.value.slice(0, 120),
                        })
                      }
                      className="border-white/15 bg-[#251d44] text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Role Description</Label>
                    <Textarea
                      value={draftRole.description}
                      onChange={(event) =>
                        onDraftRoleChange({
                          ...draftRole,
                          description: event.target.value.slice(0, 1200),
                        })
                      }
                      className="min-h-[92px] border-white/15 bg-[#251d44] text-slate-100"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Behavior Archetype</Label>
                      <Select
                        value={draftRole.behavior.archetype}
                        onValueChange={(value) =>
                          onDraftRoleChange({
                            ...draftRole,
                            behavior: {
                              ...draftRole.behavior,
                              archetype: value as BehaviorArchetype,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="border-white/15 bg-[#251d44] text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[95] border-white/15 bg-[#251d44] text-slate-100">
                          {ARCHETYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-300">Priority</Label>
                      <Select
                        value={draftRole.priority}
                        onValueChange={(value) =>
                          onDraftRoleChange({
                            ...draftRole,
                            priority: value as ExpertPriority,
                          })
                        }
                      >
                        <SelectTrigger className="border-white/15 bg-[#251d44] text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[95] border-white/15 bg-[#251d44] text-slate-100">
                          {PRIORITY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-slate-300">Creativity (Temperature)</Label>
                      <span className="text-xs text-slate-300">
                        {draftRole.behavior.temperature.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={[draftRole.behavior.temperature]}
                      onValueChange={(next) =>
                        onDraftRoleChange({
                          ...draftRole,
                          behavior: {
                            ...draftRole.behavior,
                            temperature: Number(next[0] ?? 0.5),
                          },
                        })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Response Length</Label>
                      <Select
                        value={draftRole.behavior.responseLength}
                        onValueChange={(value) =>
                          onDraftRoleChange({
                            ...draftRole,
                            behavior: {
                              ...draftRole.behavior,
                              responseLength: value as ResponseLength,
                            },
                          })
                        }
                      >
                        <SelectTrigger className="border-white/15 bg-[#251d44] text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[95] border-white/15 bg-[#251d44] text-slate-100">
                          {RESPONSE_LENGTH_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-slate-300">Output Model</Label>
                      <Select
                        value={draftRole.model.modelId}
                        onValueChange={(nextModelId) => {
                          const knownModel = getModelById(nextModelId);
                          onDraftRoleChange({
                            ...draftRole,
                            model: {
                              provider: knownModel?.provider ?? nextModelId.split("/")[0] ?? "openrouter",
                              modelId: nextModelId,
                              displayName:
                                knownModel?.name ??
                                draftRole.model.displayName ??
                                toDisplayNameFromModelId(nextModelId),
                            },
                          });
                        }}
                      >
                        <SelectTrigger className="border-white/15 bg-[#251d44] text-slate-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[95] max-h-64 border-white/15 bg-[#251d44] text-slate-100">
                          {modelOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Focus Areas (comma or line-separated)</Label>
                    <Textarea
                      value={draftRole.focusAreas.join(", ")}
                      onChange={(event) =>
                        onDraftRoleChange({
                          ...draftRole,
                          focusAreas: splitToList(event.target.value, 8),
                        })
                      }
                      className="min-h-[76px] border-white/15 bg-[#251d44] text-slate-100"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300">Interaction Style (one per line)</Label>
                    <Textarea
                      value={draftRole.behavior.interactionStyle.join("\n")}
                      onChange={(event) =>
                        onDraftRoleChange({
                          ...draftRole,
                          behavior: {
                            ...draftRole.behavior,
                            interactionStyle: splitToList(event.target.value, 8),
                          },
                        })
                      }
                      className="min-h-[96px] border-white/15 bg-[#251d44] text-slate-100"
                    />
                  </div>

                  <p className="text-xs text-slate-300">
                    Changes apply to the next agent runs in this conference session.
                  </p>
                </>
              )}
            </section>
          </div>

          <div className="border-t border-white/10 bg-[#17122b] px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                className="text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={onReset}
                disabled={!draftRole}
              >
                Reset
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-transparent text-slate-200 hover:bg-white/10 hover:text-white"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-blue-600 text-white hover:bg-blue-500"
                  onClick={onSave}
                  disabled={!draftRole || disableSave}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
