import { useMemo } from "react";
import { FileText, Rocket } from "lucide-react";
import type {
  ConfigurationMode,
  ExpertRole,
  TemplateData,
} from "@/lib/configuration/types";

type ConferenceBlueprintProps = {
  templateData: TemplateData | null;
  expertPanel: ExpertRole[];
  estimatedCost: { min: number; max: number };
  selectedMode: ConfigurationMode;
  strategyLabel: string;
  isLaunching?: boolean;
  onLaunch: () => void;
  onSaveDraft: () => void;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export default function ConferenceBlueprint({
  templateData,
  expertPanel,
  estimatedCost,
  selectedMode,
  strategyLabel,
  isLaunching = false,
  onLaunch,
  onSaveDraft,
}: ConferenceBlueprintProps) {
  const minimumAgentsRequired = 2;
  const isLaunchReady =
    Boolean(templateData) && expertPanel.length >= minimumAgentsRequired && estimatedCost.max > 0;

  const modeLabel = selectedMode === "quick-start" ? "Quick Start" : "Custom Setup";
  const budgetHealth = useMemo(() => {
    if (estimatedCost.max <= 6) {
      return { label: "Optimal", color: "text-emerald-300", width: 35 };
    }
    if (estimatedCost.max <= 12) {
      return { label: "Balanced", color: "text-amber-300", width: 68 };
    }
    return { label: "High", color: "text-rose-300", width: 92 };
  }, [estimatedCost.max]);

  return (
    <div className="sticky top-6">
      <div className="rounded-xl border border-purple-500/20 bg-[#2a2438] p-6">
        <div className="mb-6 flex items-center gap-2">
          <FileText className="h-5 w-5 text-purple-300" />
          <h2 className="text-lg font-semibold text-white">Conference Blueprint</h2>
        </div>

        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">
            Problem Statement
          </p>
          <p className="text-sm leading-relaxed text-white">
            "{templateData?.problemStatement || "Loading template..."}"
          </p>
        </div>

        <div className="space-y-4 border-b border-white/10 pb-6">
          <BlueprintItem label="Mode" value={modeLabel} />
          <BlueprintItem
            label="Strategy"
            value={strategyLabel || "Pending analysis"}
            subtext={selectedMode === "quick-start" ? "AI-managed configuration" : "User-tuned configuration"}
          />
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">
              Active Agents ({expertPanel.length})
            </p>
            <div className="flex -space-x-2 overflow-hidden">
              {expertPanel.slice(0, 5).map((role) => (
                <div
                  key={role.id}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#2a2438] bg-gradient-to-br from-purple-500 to-fuchsia-500 text-xs font-semibold text-white"
                  title={role.title}
                >
                  {role.title.charAt(0).toUpperCase()}
                </div>
              ))}
              {expertPanel.length > 5 ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#2a2438] bg-[#1d1a2a] text-xs font-semibold text-slate-300">
                  +{expertPanel.length - 5}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-b border-white/10 py-6">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-slate-400">Est. Cost</p>
          <div className="mb-2 flex items-end gap-2">
            <span className="text-3xl font-bold text-white">
              ${round2(estimatedCost.min).toFixed(2)}
            </span>
            <span className="pb-1 text-slate-500">-</span>
            <span className="pb-1 text-lg text-slate-400">
              ${round2(estimatedCost.max).toFixed(2)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-300"
              style={{ width: `${budgetHealth.width}%` }}
            />
          </div>
          <p className={`mt-1 text-xs ${budgetHealth.color}`}>{budgetHealth.label}</p>
        </div>

        <div className="space-y-3 pt-6">
          <button
            type="button"
            onClick={onLaunch}
            disabled={!isLaunchReady || isLaunching}
            className={
              isLaunchReady
                ? "flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 px-4 py-4 font-semibold text-white shadow-lg shadow-purple-600/30 transition-all duration-200 hover:from-purple-500 hover:to-purple-400 disabled:cursor-not-allowed disabled:opacity-60"
                : "w-full cursor-not-allowed rounded-lg bg-white/10 px-4 py-4 font-semibold text-slate-500"
            }
          >
            {isLaunching ? "Launching..." : "Launch Conference"}
            <Rocket className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={onSaveDraft}
            className="w-full rounded-lg border border-white/15 px-4 py-3 text-sm text-slate-300 transition-colors duration-200 hover:border-purple-500/40 hover:text-purple-200"
          >
            Save Draft
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-slate-400">
          <a href="/docs" className="transition-colors duration-200 hover:text-purple-300">
            Documentation
          </a>
          <a href="/pricing" className="transition-colors duration-200 hover:text-purple-300">
            Pricing
          </a>
          <a href="/support" className="transition-colors duration-200 hover:text-purple-300">
            Support
          </a>
        </div>
      </div>
    </div>
  );
}

function BlueprintItem({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
      {subtext ? <p className="text-xs text-purple-300">{subtext}</p> : null}
    </div>
  );
}
