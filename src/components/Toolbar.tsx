import { Search, Plus, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Group } from "@/hooks/useGroups";
import { UserRole } from "@/hooks/useUserRole";

interface ToolbarProps {
  selectedGroup: string;
  onGroupChange: (group: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  groups: Group[];
  userRole: UserRole | undefined;
  onCreateClick: () => void;
}

export const Toolbar = ({
  selectedGroup,
  onGroupChange,
  searchQuery,
  onSearchChange,
  groups,
  userRole,
  onCreateClick,
}: ToolbarProps) => {
  const canCreate = userRole === "paid" || userRole === "admin" || userRole === "free";
  
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      <Select value={selectedGroup} onValueChange={onGroupChange}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Select group" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Groups</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto" disabled>
              <Calendar className="h-4 w-4 mr-2" />
              Date
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Coming soon</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              disabled={!canCreate} 
              onClick={canCreate ? onCreateClick : undefined}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{canCreate ? "Create new template" : "Upgrade to paid to create templates"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
