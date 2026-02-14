import type { ReactNode } from "react";
import { AlertCircle, Clock3, FileText, Layers, Pencil, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCompanySize,
  formatProblemType,
  formatStakesLevel,
  formatTimeline,
} from "@/lib/configuration/format";
import type { TemplateData } from "@/lib/configuration/types";

type ChallengeSummaryProps = {
  templateData: TemplateData | null;
  isLoading?: boolean;
  onEditTemplate?: () => void;
};

export default function ChallengeSummary({
  templateData,
  isLoading = false,
  onEditTemplate,
}: ChallengeSummaryProps) {
  if (isLoading || !templateData) {
    return (
      <section className="rounded-xl border border-purple-500/20 bg-[#2a2438] p-6">
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full bg-purple-400/20" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-28 bg-white/10" />
            <Skeleton className="h-4 w-48 bg-white/10" />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-full bg-white/10" />
          <Skeleton className="h-5 w-11/12 bg-white/10" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Skeleton className="h-12 bg-white/10" />
            <Skeleton className="h-12 bg-white/10" />
            <Skeleton className="h-12 bg-white/10" />
            <Skeleton className="h-12 bg-white/10" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-300">
          01
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
          Challenge Summary
        </h2>
      </div>

      <div className="rounded-xl border border-purple-500/20 bg-[#2a2438] p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-300" />
            <h3 className="text-lg font-semibold text-white">Your Challenge (from template)</h3>
          </div>
          <button
            type="button"
            onClick={onEditTemplate}
            className="inline-flex items-center gap-1 text-sm text-slate-400 transition-colors duration-200 hover:text-purple-300"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Template
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs uppercase tracking-[0.12em] text-slate-400">
              Problem Statement
            </p>
            <p className="text-base leading-relaxed text-white">
              "{templateData.problemStatement}"
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
            <InfoItem
              label="Type"
              value={formatProblemType(templateData.type)}
              icon={<Layers className="h-4 w-4" />}
            />
            <InfoItem
              label="Stakes"
              value={formatStakesLevel(templateData.context.stakesLevel)}
              icon={<AlertCircle className="h-4 w-4" />}
            />
            <InfoItem
              label="Timeline"
              value={formatTimeline(templateData.context.timeline)}
              icon={<Clock3 className="h-4 w-4" />}
            />
            <InfoItem
              label="Company Size"
              value={formatCompanySize(templateData.context.companySize)}
              icon={<Users className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#1d1a2a] p-3">
      <div className="text-purple-300">{icon}</div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <p className="text-sm font-medium text-white">{value}</p>
      </div>
    </div>
  );
}

