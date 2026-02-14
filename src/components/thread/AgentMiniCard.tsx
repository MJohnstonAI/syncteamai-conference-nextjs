import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getAgentMeta, STANDARD_AGENT_AVATAR } from "@/lib/agents";

export function AgentMiniCard({
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
  const resolvedName = displayName?.trim() || meta?.name || agentId || "You";
  const resolvedRole = roleLabel?.trim() || meta?.roleLabel || "Agent";
  const requestedAvatar = avatarSrc?.trim() || meta?.image || STANDARD_AGENT_AVATAR;
  const [resolvedAvatar, setResolvedAvatar] = useState(requestedAvatar);

  useEffect(() => {
    setResolvedAvatar(requestedAvatar);
  }, [requestedAvatar]);

  if (!agentId) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <div className="text-sm font-medium">You</div>
        <div className="text-xs text-muted-foreground">Human participant</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 border">
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
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{resolvedName}</div>
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {resolvedRole}
          </Badge>
        </div>
      </div>
    </div>
  );
}
