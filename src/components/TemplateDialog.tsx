import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Group } from "@/hooks/useGroups";
import { Prompt, useCreatePrompt, useUpdatePrompt } from "@/hooks/usePrompts";
import { UserRole } from "@/hooks/useUserRole";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: Group[];
  userRole: UserRole | undefined;
  existingPrompt?: Prompt;
}

export const TemplateDialog = ({
  open,
  onOpenChange,
  groups,
  userRole,
  existingPrompt,
}: TemplateDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [script, setScript] = useState("");
  const [groupId, setGroupId] = useState<string>("none");
  const [isDemo, setIsDemo] = useState(false);

  const createPrompt = useCreatePrompt();
  const updatePrompt = useUpdatePrompt();

  const isEditMode = !!existingPrompt;

  // Pre-fill form when editing
  useEffect(() => {
    if (existingPrompt && open) {
      setTitle(existingPrompt.title);
      setDescription(existingPrompt.description || "");
      setScript(existingPrompt.script);
      setGroupId(existingPrompt.group_id || "none");
      setIsDemo(existingPrompt.is_demo);
    } else if (!open) {
      // Reset form when dialog closes
      setTitle("");
      setDescription("");
      setScript("");
      setGroupId("none");
      setIsDemo(false);
    }
  }, [existingPrompt, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !script.trim()) {
      return;
    }

    const promptData = {
      title: title.trim(),
      description: description.trim() || "",
      script: script.trim(),
      group_id: groupId === "none" ? null : groupId,
      is_demo: isDemo,
    };

    if (isEditMode && existingPrompt) {
      await updatePrompt.mutateAsync({
        id: existingPrompt.id,
        ...promptData,
      });
    } else {
      await createPrompt.mutateAsync(promptData);
    }

    onOpenChange(false);
  };

  const isPending = createPrompt.isPending || updatePrompt.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Template" : "Create New Template"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update the conference template details."
              : "Add a new conference template for your AI sessions."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter template title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter template description"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="script">Script/Prompt *</Label>
            <Textarea
              id="script"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Enter the conference script or prompt"
              rows={6}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group">Group</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id="group">
                <SelectValue placeholder="Select a group (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No group</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {userRole === "admin" && (
            <div className="flex items-center space-x-2">
              <Switch
                id="is-demo"
                checked={isDemo}
                onCheckedChange={setIsDemo}
              />
              <Label htmlFor="is-demo">Mark as demo template</Label>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? isEditMode
                  ? "Saving..."
                  : "Creating..."
                : isEditMode
                ? "Save Changes"
                : "Create Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
