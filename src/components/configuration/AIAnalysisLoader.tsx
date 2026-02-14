import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AIAnalysisLoader() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-300">
          03
        </div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
          AI Analysis Result
        </h2>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#2a2438] p-6">
        <div className="flex items-center gap-2 text-purple-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Analyzing challenge and assembling expert panel...</span>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 bg-white/10" />
          <Skeleton className="h-20 bg-white/10" />
          <Skeleton className="h-20 bg-white/10" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Skeleton className="h-36 bg-white/10" />
          <Skeleton className="h-36 bg-white/10" />
        </div>
      </div>
    </section>
  );
}

