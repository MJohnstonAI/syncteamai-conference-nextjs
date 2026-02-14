import type { ReactNode } from "react";
import { Bolt, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfigurationMode } from "@/lib/configuration/types";

type ConfigurationModeSelectorProps = {
  selectedMode: ConfigurationMode;
  onModeChange: (mode: ConfigurationMode) => void;
};

export default function ConfigurationModeSelector({
  selectedMode,
  onModeChange,
}: ConfigurationModeSelectorProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-300">
          02
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
          Select Configuration Mode
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModeCard
          title="Quick Start"
          description="AI analyzes complexity and assembles an expert panel automatically."
          icon={<Bolt className="h-5 w-5" />}
          active={selectedMode === "quick-start"}
          recommended
          onClick={() => onModeChange("quick-start")}
        />
        <ModeCard
          title="Custom Setup"
          description="Start from recommendations, then edit role behavior and model choices."
          icon={<SlidersHorizontal className="h-5 w-5" />}
          active={selectedMode === "custom"}
          onClick={() => onModeChange("custom")}
        />
      </div>
    </section>
  );
}

function ModeCard({
  title,
  description,
  icon,
  active,
  onClick,
  recommended = false,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  recommended?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-xl border p-5 text-left transition-all duration-200",
        active
          ? "border-purple-400 bg-[#2a2438] shadow-lg shadow-purple-700/20"
          : "border-white/10 bg-[#2a2438]/80 hover:-translate-y-0.5 hover:border-purple-500/40"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            active ? "bg-purple-500/25 text-purple-300" : "bg-white/5 text-slate-300"
          )}
        >
          {icon}
        </div>
        {recommended ? (
          <span className="rounded-full border border-purple-400/30 bg-purple-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-300">
            Recommended
          </span>
        ) : null}
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </button>
  );
}
