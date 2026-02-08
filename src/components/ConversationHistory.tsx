import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { useConversations, useDeleteConversation } from "@/hooks/useConversations";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface ConversationHistoryProps {
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

export const ConversationHistory = ({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationHistoryProps) => {
  const { data: conversations = [], isLoading } = useConversations();
  const deleteConversation = useDeleteConversation();
  const { toast } = useToast();

  const handleDelete = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversation.mutateAsync(conversationId);
      toast({
        title: "Success",
        description: "Conversation deleted",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive",
      });
    }
  };

  return (
    <aside className="w-full border-r flex flex-col bg-muted/30">
      <div className="p-4 border-b">
        <Button onClick={onNewConversation} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Conference
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            <>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full mb-2" />
              ))}
            </>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full p-3 rounded-lg text-left transition-all hover:bg-accent group ${
                  currentConversationId === conv.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{conv.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDelete(conv.id, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
};
