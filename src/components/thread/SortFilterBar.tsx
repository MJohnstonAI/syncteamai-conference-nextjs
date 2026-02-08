import { ArrowDownAZ, ArrowUpWideNarrow, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ThreadAgent, ThreadRound, ThreadSort } from "@/lib/thread/types";

export function SortFilterBar({
  sort,
  onSortChange,
  roundFilter,
  onRoundFilterChange,
  agentFilter,
  onAgentFilterChange,
  rounds,
  agents,
}: {
  sort: ThreadSort;
  onSortChange: (value: ThreadSort) => void;
  roundFilter: string;
  onRoundFilterChange: (value: string) => void;
  agentFilter: string;
  onAgentFilterChange: (value: string) => void;
  rounds: ThreadRound[];
  agents: ThreadAgent[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card/50 p-2">
      <div className="inline-flex items-center gap-1 rounded-md border bg-background p-1">
        <Button
          type="button"
          size="sm"
          variant={sort === "new" ? "default" : "ghost"}
          onClick={() => onSortChange("new")}
          className="h-8"
        >
          <ArrowDownAZ className="h-4 w-4" />
          New
        </Button>
        <Button
          type="button"
          size="sm"
          variant={sort === "top" ? "default" : "ghost"}
          onClick={() => onSortChange("top")}
          className="h-8"
        >
          <ArrowUpWideNarrow className="h-4 w-4" />
          Top
        </Button>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={roundFilter} onValueChange={onRoundFilterChange}>
          <SelectTrigger className="h-8 w-[150px]">
            <SelectValue placeholder="Round" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rounds</SelectItem>
            {rounds.map((round) => (
              <SelectItem key={round.id} value={round.id}>
                {round.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={agentFilter} onValueChange={onAgentFilterChange}>
          <SelectTrigger className="h-8 w-[150px]">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
