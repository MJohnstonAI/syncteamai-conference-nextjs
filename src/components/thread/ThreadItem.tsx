import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronRight, Link2, Reply, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentBadge } from "@/components/thread/AgentBadge";
import { RoundPill } from "@/components/thread/RoundPill";
import type { ThreadNode } from "@/lib/thread/types";
import { cn } from "@/lib/utils";

export function ThreadItem({
  node,
  roundLabel,
  hasChildren,
  collapsed,
  selected,
  isLinkTarget,
  onSelect,
  onReply,
  onToggleCollapse,
  onCopyLink,
  onToggleHighlight,
  agentDisplay,
  children,
}: {
  node: ThreadNode;
  roundLabel?: string;
  hasChildren: boolean;
  collapsed: boolean;
  selected: boolean;
  isLinkTarget: boolean;
  onSelect: () => void;
  onReply: () => void;
  onToggleCollapse: () => void;
  onCopyLink: () => void;
  onToggleHighlight: () => void;
  agentDisplay?: {
    displayName?: string;
    avatarSrc?: string;
    roleLabel?: string;
  };
  children?: React.ReactNode;
}) {
  const indentPx = Math.min(node.depth, 10) * 22;

  return (
    <div className="relative" style={{ marginLeft: `${indentPx}px` }}>
      {node.depth > 0 ? (
        <div aria-hidden className="absolute -left-3 bottom-0 top-0 w-px bg-border/70" />
      ) : null}

      <article
        id={`message-${node.id}`}
        className={cn(
          "group rounded-lg border bg-card/70 p-3 transition-colors",
          selected ? "border-primary/60" : "border-border/70",
          node.isHighlight ? "bg-amber-50/30 dark:bg-amber-900/10" : "",
          isLinkTarget ? "ring-2 ring-primary/40" : ""
        )}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {hasChildren ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse();
              }}
              aria-label={collapsed ? "Expand thread" : "Collapse thread"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          ) : (
            <span className="inline-block h-6 w-6" aria-hidden />
          )}

          <button
            type="button"
            onClick={onSelect}
            className="inline-flex min-w-0 items-center gap-2 text-left"
          >
            <AgentBadge
              agentId={node.avatarId}
              displayName={agentDisplay?.displayName}
              avatarSrc={agentDisplay?.avatarSrc}
              roleLabel={agentDisplay?.roleLabel}
            />
          </button>

          {roundLabel ? <RoundPill label={roundLabel} /> : null}
          <span className="text-xs text-muted-foreground">
            {new Date(node.createdAt).toLocaleString()}
          </span>
        </div>

        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node: _node, ...props }) => (
                <a
                  {...props}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-2"
                />
              ),
            }}
          >
            {node.content}
          </ReactMarkdown>
        </div>

        <div className="mt-3 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onReply();
            }}
          >
            <Reply className="h-4 w-4" />
            Reply
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onCopyLink();
            }}
          >
            <Link2 className="h-4 w-4" />
            Copy link
          </Button>
          <Button
            type="button"
            variant={node.isHighlight ? "secondary" : "ghost"}
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onToggleHighlight();
            }}
          >
            <Star className="h-4 w-4" />
            Highlight
          </Button>
        </div>

        {children ? <div className="mt-3 border-t pt-3">{children}</div> : null}
      </article>
    </div>
  );
}
