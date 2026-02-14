import { useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Layers,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import { formatProblemType, formatStrategy } from "@/lib/configuration/format";
import type { ChallengeAnalysis } from "@/lib/configuration/types";

type AIAnalysisResultProps = {
  analysis: ChallengeAnalysis;
};

const getComplexityBadge = (score: number) => {
  if (score >= 8) return { label: "High", className: "text-orange-300" };
  if (score >= 5) return { label: "Moderate", className: "text-amber-300" };
  return { label: "Low", className: "text-emerald-300" };
};

export default function AIAnalysisResult({ analysis }: AIAnalysisResultProps) {
  const [showDetails, setShowDetails] = useState(false);
  const complexity = getComplexityBadge(analysis.complexityScore);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-300">
          03
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
          AI Analysis Result
        </h2>
        <div className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Analysis Complete
        </div>
      </div>

      <div className="rounded-xl border border-purple-500/20 bg-[#2a2438] p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="mt-1 text-sm font-semibold uppercase tracking-[0.12em] text-purple-300">Focus</div>
          <div>
            <h3 className="text-xl font-semibold text-white">AI Analysis Complete</h3>
            <p className="mt-1 text-sm text-slate-400">
              Recommended panel and strategy generated from your template context.
            </p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AnalysisMetric
            label="Problem Type"
            value={formatProblemType(analysis.problemType)}
            icon={<Layers className="h-4 w-4" />}
          />
          <AnalysisMetric
            label="Complexity"
            value={`${complexity.label} (${analysis.complexityScore}/10)`}
            icon={<TrendingUp className="h-4 w-4" />}
            valueClassName={complexity.className}
          />
          <AnalysisMetric
            label="Est. Duration"
            value={`~${analysis.estimatedDuration} mins`}
            icon={<Clock3 className="h-4 w-4" />}
          />
        </div>

        <div className="rounded-lg border border-white/10 bg-[#1a1625] p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-purple-300">
            Recommended Strategy
          </p>
          <p className="font-semibold text-white">{formatStrategy(analysis.recommendedStrategy)}</p>
          <p className="mt-1 text-sm text-slate-400">{analysis.strategyReason}</p>
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((previous) => !previous)}
          className="mt-4 inline-flex items-center gap-1 text-sm text-purple-300 transition-colors duration-200 hover:text-purple-200"
        >
          {showDetails ? "Hide" : "Show"} detailed analysis
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}
          />
        </button>

        {showDetails ? (
          <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-200">Key Considerations</h4>
              <div className="flex flex-wrap gap-2">
                {analysis.keyConsiderations.map((consideration, index) => (
                  <span
                    key={`${consideration}-${index}`}
                    className="rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-xs text-purple-200"
                  >
                    {consideration}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h4 className="mb-1 text-sm font-semibold text-slate-200">Complexity Reasoning</h4>
              <p className="text-sm text-slate-400">{analysis.complexityReason}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-[#1d1a2a] p-3 text-xs text-slate-400">
              <p className="inline-flex items-center gap-1">
                <Lightbulb className="h-3.5 w-3.5 text-purple-300" />
                Source:{" "}
                <span className="font-semibold text-slate-200">
                  {analysis.analysisSource === "ai" ? "OpenRouter model analysis" : "Heuristic fallback analysis"}
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AnalysisMetric({
  label,
  value,
  icon,
  valueClassName,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#1d1a2a] p-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-purple-300">{icon}</span>
        <span className={`text-sm font-semibold text-white ${valueClassName ?? ""}`}>{value}</span>
      </div>
    </div>
  );
}

