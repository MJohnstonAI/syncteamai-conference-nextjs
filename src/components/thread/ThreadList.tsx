import { useMemo } from "react";
import { ThreadItem } from "@/components/thread/ThreadItem";
import type { ThreadNode } from "@/lib/thread/types";

const getVisibleNodes = (nodes: ThreadNode[], collapsedIds: Set<string>) => {
  const visible: ThreadNode[] = [];
  const collapsedDepths: number[] = [];

  for (const node of nodes) {
    while (collapsedDepths.length > 0 && node.depth <= collapsedDepths[collapsedDepths.length - 1]) {
      collapsedDepths.pop();
    }

    if (collapsedDepths.length > 0) {
      continue;
    }

    visible.push(node);
    if (collapsedIds.has(node.id)) {
      collapsedDepths.push(node.depth);
    }
  }

  return visible;
};

export function ThreadList({
  nodes,
  collapsedIds,
  selectedMessageId,
  linkTargetId,
  roundLabelById,
  onSelectMessage,
  onToggleCollapse,
  onReply,
  onCopyLink,
  onToggleHighlight,
  renderReplyComposer,
  agentDisplayById,
}: {
  nodes: ThreadNode[];
  collapsedIds: Set<string>;
  selectedMessageId: string | null;
  linkTargetId: string | null;
  roundLabelById: Record<string, string>;
  onSelectMessage: (messageId: string) => void;
  onToggleCollapse: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onCopyLink: (messageId: string) => void;
  onToggleHighlight: (messageId: string, highlighted: boolean) => void;
  renderReplyComposer: (node: ThreadNode) => React.ReactNode;
  agentDisplayById?: Record<
    string,
    {
      displayName?: string;
      avatarSrc?: string;
      roleLabel?: string;
    }
  >;
}) {
  const childCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of nodes) {
      if (!node.parentMessageId) continue;
      map.set(node.parentMessageId, (map.get(node.parentMessageId) ?? 0) + 1);
    }
    return map;
  }, [nodes]);

  const visibleNodes = useMemo(() => getVisibleNodes(nodes, collapsedIds), [nodes, collapsedIds]);

  return (
    <div className="space-y-3">
      {visibleNodes.map((node) => (
        <ThreadItem
          key={node.id}
          node={node}
          roundLabel={node.roundId ? roundLabelById[node.roundId] : undefined}
          hasChildren={(childCountMap.get(node.id) ?? 0) > 0}
          collapsed={collapsedIds.has(node.id)}
          selected={selectedMessageId === node.id}
          isLinkTarget={linkTargetId === node.id}
          onSelect={() => onSelectMessage(node.id)}
          onToggleCollapse={() => onToggleCollapse(node.id)}
          onReply={() => onReply(node.id)}
          onCopyLink={() => onCopyLink(node.id)}
          onToggleHighlight={() => onToggleHighlight(node.id, !node.isHighlight)}
          agentDisplay={node.avatarId ? agentDisplayById?.[node.avatarId] : undefined}
        >
          {renderReplyComposer(node)}
        </ThreadItem>
      ))}
    </div>
  );
}
