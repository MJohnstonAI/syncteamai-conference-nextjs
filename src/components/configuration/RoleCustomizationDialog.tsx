import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type {
  BehaviorArchetype,
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

export default function RoleCustomizationDialog({
  role,
  open,
  onOpenChange,
  onSave,
}: RoleCustomizationDialogProps) {
  const [archetype, setArchetype] = useState<BehaviorArchetype>("analytical");
  const [temperature, setTemperature] = useState(0.5);
  const [responseLength, setResponseLength] = useState<ResponseLength>("medium");

  useEffect(() => {
    if (!role) return;
    setArchetype(role.behavior.archetype);
    setTemperature(role.behavior.temperature);
    setResponseLength(role.behavior.responseLength);
  }, [role]);

  const handleSave = () => {
    if (!role) return;
    onSave({
      ...role,
      behavior: {
        ...role.behavior,
        archetype,
        temperature,
        responseLength,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-purple-500/20 bg-[#1d1a2a] text-slate-100 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Customize Role</DialogTitle>
          <DialogDescription className="text-slate-400">
            Tune behavior settings for <span className="font-medium text-slate-200">{role?.title ?? "selected role"}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-slate-300">Behavior Archetype</Label>
            <Select
              value={archetype}
              onValueChange={(value) => setArchetype(value as BehaviorArchetype)}
            >
              <SelectTrigger className="border-white/10 bg-[#2a2438] text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#2a2438] text-slate-100">
                {ARCHETYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300">Temperature</Label>
              <span className="text-xs text-slate-400">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[temperature]}
              onValueChange={(next) => setTemperature(Number(next[0] ?? 0.5))}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">Response Length</Label>
            <Select
              value={responseLength}
              onValueChange={(value) => setResponseLength(value as ResponseLength)}
            >
              <SelectTrigger className="border-white/10 bg-[#2a2438] text-slate-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#2a2438] text-slate-100">
                {RESPONSE_LENGTH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/15 bg-transparent text-slate-200 hover:bg-white/5">
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-purple-600 text-white hover:bg-purple-500">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

