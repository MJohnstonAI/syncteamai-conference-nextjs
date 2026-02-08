import { useState, useMemo } from "react";
import { Send, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "@/lib/router";
import { Prompt } from "@/hooks/usePrompts";
import { Group } from "@/hooks/useGroups";
import { UserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useDeletePrompt } from "@/hooks/usePrompts";
import { TemplateDialog } from "@/components/TemplateDialog";

interface TemplateCardProps {
  prompt: Prompt;
  userRole: UserRole | undefined;
  groups: Group[];
}

export const TemplateCard = ({ prompt, userRole, groups }: TemplateCardProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const deletePrompt = useDeletePrompt();
  const [showEditDialog, setShowEditDialog] = useState(false);

  const groupName = useMemo(() => {
    const group = groups.find((g) => g.id === prompt.group_id);
    return group?.name || "Uncategorized";
  }, [prompt.group_id, groups]);

  const isPrivilegedUser = userRole === "paid" || userRole === "admin" || userRole === "free";

  const canEdit = useMemo(() => {
    // Admin can edit demo prompts
    if (prompt.is_demo && userRole === "admin") return true;
    // Users can edit their own non-demo prompts if paid/admin/free
    if (!prompt.is_demo && prompt.user_id === user?.id && isPrivilegedUser) return true;
    return false;
  }, [prompt, user, userRole, isPrivilegedUser]);

  const handleSendToConference = () => {
    const params = new URLSearchParams({
      title: prompt.title,
      script: prompt.script,
    });
    if (prompt.id) {
      params.set("prompt_id", prompt.id);
    }
    navigate(`/conference?${params.toString()}`);
  };

  const handleEdit = () => {
    setShowEditDialog(true);
  };

  const handleDelete = () => {
    if (!canEdit) {
      toast({
        title: "Permission denied",
        description: "You don't have permission to delete this template.",
        variant: "destructive",
      });
      return;
    }

    deletePrompt.mutate(prompt.id);
  };

  return (
    <>
      <Card className="transition-all hover:shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={prompt.is_demo ? "default" : "secondary"} className="text-xs">
                  {prompt.is_demo ? "Demo" : groupName}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(prompt.created_at).toLocaleDateString()}
                </span>
              </div>
              <CardTitle className="text-lg leading-tight">{prompt.title}</CardTitle>
            </div>
          </div>
          <CardDescription className="line-clamp-2 mt-2">
            {prompt.description || "No description"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleSendToConference} className="flex-1 sm:flex-initial">
            <Send className="h-3 w-3 mr-2" />
            Send to Conference
          </Button>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={handleEdit}>
                <Edit className="h-3 w-3 mr-2" />
                Edit
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleDelete}
                disabled={deletePrompt.isPending}
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Delete
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <TemplateDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        groups={groups}
        userRole={userRole}
        existingPrompt={prompt}
      />
    </>
  );
};

