import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getAgentMeta } from "@/lib/agents";

export function AgentBadge({ agentId }: { agentId: string | null }) {
  if (!agentId) {
    return <Badge variant="secondary">Human</Badge>;
  }

  const meta = getAgentMeta(agentId);
  if (!meta) {
    return <Badge variant="outline">{agentId}</Badge>;
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-2 py-1">
      <Avatar className="h-5 w-5 border">
        <img src={meta.image} alt={meta.name} className="h-full w-full object-cover" />
      </Avatar>
      <span className="text-xs font-medium">{meta.name}</span>
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
        {meta.roleLabel}
      </Badge>
    </div>
  );
}
