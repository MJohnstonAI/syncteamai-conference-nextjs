import type { ComponentType } from "react";
import {
  Building2,
  Check,
  Cloud,
  Database,
  DollarSign,
  Info,
  Layers3,
  Shield,
  Sparkles,
  UserCog,
  Users,
} from "lucide-react";
import type { ExpertRole } from "@/lib/configuration/types";

type ExpertPanelDisplayProps = {
  panel: ExpertRole[];
  onRoleCustomize: (roleId: string) => void;
};

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  "building-2": Building2,
  cloud: Cloud,
  shield: Shield,
  database: Database,
  "dollar-sign": DollarSign,
  users: Users,
  sparkles: Sparkles,
  layers: Layers3,
  "user-cog": UserCog,
};

const resolveIcon = (iconName: string) => {
  const Icon = iconMap[iconName] ?? Building2;
  return <Icon className="h-6 w-6" />;
};

export default function ExpertPanelDisplay({
  panel,
  onRoleCustomize,
}: ExpertPanelDisplayProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">
          Proposed Expert Panel ({panel.length} {panel.length === 1 ? "Role" : "Roles"})
        </h2>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-purple-300 transition-colors duration-200 hover:text-purple-200"
          title="AI selects roles based on problem type, complexity, risk profile, and execution constraints."
        >
          <Info className="h-3.5 w-3.5" />
          Why these roles?
        </button>
      </div>

      {panel.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#2a2438] p-5 text-sm text-slate-400">
          No roles are available yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {panel.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onCustomize={() => onRoleCustomize(role.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleCard({
  role,
  onCustomize,
}: {
  role: ExpertRole;
  onCustomize: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#2a2438] p-5 transition-colors duration-200 hover:border-purple-500/40">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300">
            {resolveIcon(role.icon)}
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">{role.title}</h3>
            <p className="text-sm text-slate-400">{role.category}</p>
          </div>
        </div>
        {role.priority === "critical" ? (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-medium text-red-300">
            Critical
          </span>
        ) : null}
      </div>

      <p className="mb-4 text-sm text-slate-300">{role.description}</p>

      <div className="mb-4 space-y-2 rounded-lg border border-white/5 bg-[#1d1a2a] p-3">
        <MetaRow label="Behavior" value={role.behavior.archetype} />
        <MetaRow label="Temp" value={role.behavior.temperature.toFixed(2)} />
        <MetaRow label="Model" value={role.model.displayName} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {role.focusAreas.slice(0, 3).map((focus) => (
          <span
            key={focus}
            className="rounded-full border border-purple-400/20 bg-purple-500/10 px-2.5 py-1 text-[11px] text-purple-200"
          >
            {focus}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-purple-500/10 px-3 py-2 text-sm text-purple-300 transition-colors duration-200 hover:bg-purple-500/20"
        >
          <Check className="h-4 w-4" />
          Included
        </button>
        <button
          type="button"
          onClick={onCustomize}
          className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300 transition-colors duration-200 hover:border-purple-500/40 hover:text-purple-200"
        >
          Customize
        </button>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium capitalize text-slate-200">{value}</span>
    </div>
  );
}

