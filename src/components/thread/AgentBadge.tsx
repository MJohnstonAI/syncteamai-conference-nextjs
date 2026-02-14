import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getAgentMeta, STANDARD_AGENT_AVATAR } from "@/lib/agents";

export function AgentBadge({
  agentId,
  displayName,
  avatarSrc,
  roleLabel,
}: {
  agentId: string | null;
  displayName?: string;
  avatarSrc?: string;
  roleLabel?: string;
}) {
  const meta = getAgentMeta(agentId);
  const resolvedName = displayName?.trim() || meta?.name || agentId || "Human";
  const resolvedRole = roleLabel?.trim() || meta?.roleLabel || "Agent";
  const requestedAvatar = avatarSrc?.trim() || meta?.image || STANDARD_AGENT_AVATAR;
  const [resolvedAvatar, setResolvedAvatar] = useState(requestedAvatar);

  useEffect(() => {
    setResolvedAvatar(requestedAvatar);
  }, [requestedAvatar]);

  if (!agentId) {
    return <Badge variant="secondary">Human</Badge>;
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-2 py-1">
      <Avatar className="h-5 w-5 border">
        <img
          src={resolvedAvatar}
          alt={resolvedName}
          className="h-full w-full object-cover"
          onError={() => {
            if (resolvedAvatar !== STANDARD_AGENT_AVATAR) {
              setResolvedAvatar(STANDARD_AGENT_AVATAR);
            }
          }}
        />
      </Avatar>
      <span className="text-xs font-medium">{resolvedName}</span>
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
        {resolvedRole}
      </Badge>
    </div>
  );
}
