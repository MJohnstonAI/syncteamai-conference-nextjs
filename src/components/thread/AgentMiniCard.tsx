import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getAgentMeta } from "@/lib/agents";

export function AgentMiniCard({ agentId }: { agentId: string | null }) {
  if (!agentId) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <div className="text-sm font-medium">You</div>
        <div className="text-xs text-muted-foreground">Human participant</div>
      </div>
    );
  }

  const meta = getAgentMeta(agentId);
  if (!meta) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <div className="text-sm font-medium">{agentId}</div>
        <div className="text-xs text-muted-foreground">Unknown agent</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 border">
          <img src={meta.image} alt={meta.name} className="h-full w-full object-cover" />
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{meta.name}</div>
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {meta.roleLabel}
          </Badge>
        </div>
      </div>
    </div>
  );
}
