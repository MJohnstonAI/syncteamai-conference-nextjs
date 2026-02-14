import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { OPENROUTER_MODELS, getModelById } from "@/data/openRouterModels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import type {
  BehaviorArchetype,
  ExpertPriority,
  ExpertRole,
  ResponseLength,
} from "@/lib/configuration/types";

type RoleCustomizationDialogProps = {
  role: ExpertRole | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (role: ExpertRole) => void;
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

const splitToList = (value: string, maxItems: number): string[] =>
  value
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, maxItems);

const toDisplayNameFromModelId = (modelId: string): string => {
  const suffix = modelId.split("/")[1] ?? modelId;
  const normalized = suffix.replace(/[-_]+/g, " ").trim();
  if (!normalized) return "OpenRouter Model";
  return normalized
    .split(" ")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
};

const isOverrideRole = (role: ExpertRole | null): boolean =>
  Boolean(
    role &&
      role.category.trim().toLowerCase() === "debate participant" &&
      /explicit override marker/i.test(role.whyIncluded)
  );

export default function RoleCustomizationDialog({
  role,
  open,
  onOpenChange,
  onSave,
}: RoleCustomizationDialogProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [archetype, setArchetype] = useState<BehaviorArchetype>("analytical");
  const [temperature, setTemperature] = useState(0.5);
  const [responseLength, setResponseLength] = useState<ResponseLength>("medium");
  const [priority, setPriority] = useState<ExpertPriority>("recommended");
  const [focusAreasText, setFocusAreasText] = useState("");
  const [interactionStyleText, setInteractionStyleText] = useState("");
  const [modelId, setModelId] = useState("");
  const [whyIncluded, setWhyIncluded] = useState("");

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

  useEffect(() => {
    if (!role) return;
    setTitle(role.title);
    setCategory(role.category);
    setDescription(role.description);
    setArchetype(role.behavior.archetype);
    setTemperature(role.behavior.temperature);
    setResponseLength(role.behavior.responseLength);
    setPriority(role.priority);
    setFocusAreasText(role.focusAreas.join(", "));
    setInteractionStyleText(role.behavior.interactionStyle.join("\n"));
    setModelId(role.model.modelId);
    setWhyIncluded(role.whyIncluded);
  }, [role]);

  const modelOptions = useMemo(() => {
    const base = OPENROUTER_MODELS
      .map((model) => ({
        id: model.id,
        label: `${model.name} (${model.provider})`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));

    const current = modelId.trim();
    if (!current || base.some((option) => option.id === current)) {
      return base;
    }

    return [
      {
        id: current,
        label: `${toDisplayNameFromModelId(current)} (custom)`,
      },
      ...base,
    ];
  }, [modelId]);

  if (!open || !role) {
    return null;
  }

  const handleSave = () => {
    const nextModelId = modelId.trim() || role.model.modelId;
    const knownModel = getModelById(nextModelId);
    const nextFocusAreas = splitToList(focusAreasText, 10);
    const nextInteractionStyle = splitToList(interactionStyleText, 8);

    onSave({
      ...role,
      title: title.trim() || role.title,
      category: category.trim() || role.category,
      description: description.trim() || role.description,
      focusAreas: nextFocusAreas.length > 0 ? nextFocusAreas : role.focusAreas,
      behavior: {
        ...role.behavior,
        archetype,
        temperature,
        responseLength,
        interactionStyle:
          nextInteractionStyle.length > 0
            ? nextInteractionStyle
            : role.behavior.interactionStyle,
      },
      model: {
        provider: knownModel?.provider ?? nextModelId.split("/")[0] ?? role.model.provider,
        modelId: nextModelId,
        displayName:
          knownModel?.name ??
          role.model.displayName ??
          toDisplayNameFromModelId(nextModelId),
      },
      priority,
      whyIncluded: whyIncluded.trim() || role.whyIncluded,
    });

    onOpenChange(false);
  };

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
                  Refine role definitions and interaction models.
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
            {isOverrideRole(role) ? (
              <div className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                This role came from a template override marker (<span className="font-semibold">***role***</span>).
              </div>
            ) : null}

            <section className="space-y-4 rounded-xl border border-indigo-500/35 bg-[#15112a] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Pack Identity
                </h3>
                <Badge variant="outline" className="border-white/20 bg-white/5 text-slate-200">
                  {priority}
                </Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Role Title</Label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, 120))}
                  className="border-white/15 bg-[#251d44] text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Category</Label>
                <Input
                  value={category}
                  onChange={(event) => setCategory(event.target.value.slice(0, 120))}
                  className="border-white/15 bg-[#251d44] text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Role Description</Label>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value.slice(0, 1200))}
                  className="min-h-[96px] border-white/15 bg-[#251d44] text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-300">Behavior Archetype</Label>
                  <Select
                    value={archetype}
                    onValueChange={(value) => setArchetype(value as BehaviorArchetype)}
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
                    value={priority}
                    onValueChange={(value) => setPriority(value as ExpertPriority)}
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
                  <Label className="text-slate-300">Creativity (Temp)</Label>
                  <span className="text-xs text-slate-300">{temperature.toFixed(2)}</span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[temperature]}
                  onValueChange={(next) => setTemperature(Number(next[0] ?? 0.5))}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-300">Response Length</Label>
                  <Select
                    value={responseLength}
                    onValueChange={(value) => setResponseLength(value as ResponseLength)}
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
                  <Label className="text-slate-300">Model</Label>
                  <Select value={modelId} onValueChange={setModelId}>
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
                  value={focusAreasText}
                  onChange={(event) => setFocusAreasText(event.target.value)}
                  className="min-h-[76px] border-white/15 bg-[#251d44] text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Interaction Style (one per line)</Label>
                <Textarea
                  value={interactionStyleText}
                  onChange={(event) => setInteractionStyleText(event.target.value)}
                  className="min-h-[96px] border-white/15 bg-[#251d44] text-slate-100"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Inclusion Rationale</Label>
                <Textarea
                  value={whyIncluded}
                  onChange={(event) => setWhyIncluded(event.target.value.slice(0, 2000))}
                  className="min-h-[82px] border-white/15 bg-[#251d44] text-slate-100"
                />
              </div>
            </section>
          </div>

          <div className="border-t border-white/10 bg-[#17122b] px-6 py-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                onClick={handleSave}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
