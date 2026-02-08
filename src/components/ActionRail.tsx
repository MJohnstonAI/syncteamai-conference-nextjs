import { useState } from "react";
import { Home, FileText, Trash2, Copy, Download, HelpCircle, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "@/lib/router";
import { useToast } from "@/hooks/use-toast";
import { useDeleteConversation } from "@/hooks/useConversations";
import type { Message } from "@/hooks/useMessages";

interface ActionRailProps {
  conversationId?: string;
  messages?: Message[];
  conversationTitle?: string;
}

export const ActionRail = ({ conversationId, messages = [], conversationTitle }: ActionRailProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const deleteConversation = useDeleteConversation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const avatarMap: Record<string, string> = {
    chatgpt: "ChatGPT",
    claude: "Claude",
    gemini: "Gemini",
    llama: "Llama",
    mistral: "Mistral",
    qwen: "Qwen",
    gemma: "Gemma",
    grok: "Grok",
  };

  // Format messages as rich HTML (for clipboard - preserves rendered structure)
  const formatAsRichHTML = (msgs: Message[]): string => {
    return msgs
      .map((msg) => {
        const speaker =
          msg.role === "user"
            ? "You"
            : msg.avatar_id
            ? avatarMap[msg.avatar_id] || msg.avatar_id
            : "Assistant";
        const timestamp = new Date(msg.created_at).toLocaleTimeString();
        
        // Match the rendered structure from Conference.tsx
        const bgColor = msg.role === "user" ? "#3b82f6" : "#f4f4f5";
        const textColor = msg.role === "user" ? "#ffffff" : "#09090b";
        
        return `
          <div style="margin-bottom: 1rem;">
            ${msg.role === "assistant" && msg.avatar_id ? `<div style="font-size: 0.75rem; font-weight: 600; margin-bottom: 0.25rem; opacity: 0.7;">${speaker} AI</div>` : ''}
            <div style="background-color: ${bgColor}; color: ${textColor}; padding: 0.75rem 1rem; border-radius: 0.5rem; max-width: 75%; display: inline-block;">
              <div style="font-size: 0.875rem; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word;">${msg.content.replace(/\n/g, '<br>')}</div>
              <div style="font-size: 0.75rem; opacity: 0.6; margin-top: 0.5rem;">${timestamp}</div>
            </div>
          </div>
        `;
      })
      .join("");
  };

  // Format messages as HTML document (for download)
  const formatAsHTML = (msgs: Message[]): string => {
    const messagesHTML = msgs
      .map((msg) => {
        const speaker =
          msg.role === "user"
            ? "You"
            : msg.avatar_id
            ? avatarMap[msg.avatar_id] || msg.avatar_id
            : "Assistant";
        const roleClass = msg.role === "user" ? "user-message" : "assistant-message";
        const timestamp = new Date(msg.created_at).toLocaleString();
        
        return `
          <div class="message ${roleClass}">
            <div class="message-header">
              <span class="speaker">${speaker}</span>
              <span class="timestamp">${timestamp}</span>
            </div>
            <div class="message-content">${msg.content.replace(/\n/g, '<br>')}</div>
          </div>
        `;
      })
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${conversationTitle || "Conference"} - SyncTeamAI</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f5f5f5;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      text-align: center;
    }
    .header h1 {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
    }
    .header p {
      opacity: 0.9;
      font-size: 0.95rem;
    }
    .messages {
      padding: 2rem;
    }
    .message {
      margin-bottom: 2rem;
      padding: 1.5rem;
      border-radius: 8px;
      background: #fafafa;
      border-left: 4px solid #e0e0e0;
    }
    .user-message {
      background: #f0f4ff;
      border-left-color: #667eea;
    }
    .assistant-message {
      background: #f8f9ff;
      border-left-color: #764ba2;
    }
    .message-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    .speaker {
      font-weight: 600;
      font-size: 1rem;
      color: #333;
    }
    .timestamp {
      font-size: 0.8rem;
      color: #666;
    }
    .message-content {
      color: #444;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .footer {
      text-align: center;
      padding: 1.5rem;
      background: #fafafa;
      color: #666;
      font-size: 0.85rem;
      border-top: 1px solid #e0e0e0;
    }
    @media (max-width: 640px) {
      body {
        padding: 1rem 0.5rem;
      }
      .header, .messages {
        padding: 1.5rem 1rem;
      }
      .message {
        padding: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${conversationTitle || "Conference Transcript"}</h1>
      <p>Exported from SyncTeamAI on ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="messages">
      ${messagesHTML}
    </div>
    <div class="footer">
      <p>Generated by SyncTeamAI - Multi-Agent AI Collaboration Platform</p>
    </div>
  </div>
</body>
</html>`;
  };

  const handleDelete = () => {
    if (!conversationId) {
      toast({ title: "No Conference", description: "No active conference to delete." });
      return;
    }
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (!conversationId) return;
    
    deleteConversation.mutate(conversationId, {
      onSuccess: () => {
        toast({ title: "Deleted", description: "Conference deleted successfully." });
        navigate("/conference");
        setShowDeleteDialog(false);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete conference.", variant: "destructive" });
        setShowDeleteDialog(false);
      },
    });
  };

  // Native copy function - mimics Ctrl+C behavior with both HTML and plain text
  const copyAsRichText = async () => {
    if (messages.length === 0) {
      toast({ title: "No Content", description: "Start a conference to copy messages." });
      return;
    }

    const htmlContent = formatAsRichHTML(messages);
    
    // Plain text version (for editors that don't support HTML)
    const plainText = messages
      .map((msg) => {
        const speaker =
          msg.role === "user"
            ? "You"
            : msg.avatar_id
            ? avatarMap[msg.avatar_id] || msg.avatar_id
            : "Assistant";
        const timestamp = new Date(msg.created_at).toLocaleTimeString();
        return `${speaker} (${timestamp}):\n${msg.content}\n`;
      })
      .join("\n");

    try {
      // Modern API: Write both formats (like native copy does)
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const htmlBlob = new Blob([htmlContent], { type: "text/html" });
        const textBlob = new Blob([plainText], { type: "text/plain" });
        
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": htmlBlob,
            "text/plain": textBlob,
          }),
        ]);
        
        toast({ title: "Copied!", description: "Conference copied to clipboard." });
      } else {
        // Fallback for older browsers
        await navigator.clipboard.writeText(plainText);
        toast({ title: "Copied!", description: "Conference copied as plain text." });
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "Failed to copy to clipboard.", 
        variant: "destructive" 
      });
    }
  };

  const handleDownloadHTML = () => {
    if (messages.length === 0) {
      toast({ title: "No Content", description: "Start a conference to export messages." });
      return;
    }
    const html = formatAsHTML(messages);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conversationTitle || "conference"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "Conference exported as HTML file." });
  };

  const actions = [
    { icon: Home, label: "Home", onClick: () => navigate("/") },
    { icon: FileText, label: "Templates", onClick: () => navigate("/templates") },
    { icon: Settings, label: "AI Settings", onClick: () => navigate("/settings") },
    { icon: Trash2, label: "Delete Conference", onClick: handleDelete },
    { icon: Copy, label: "Copy to Clipboard", onClick: copyAsRichText },
    { icon: Download, label: "Download HTML", onClick: handleDownloadHTML },
    { 
      icon: HelpCircle, 
      label: "Help", 
      onClick: () => toast({ title: "Coming soon", description: "Help documentation will be available soon." })
    },
  ];

  return (
    <>
      <div className="h-full w-16 bg-black flex flex-col items-center py-4 gap-3">
        <TooltipProvider>
          {actions.map((action, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={action.onClick}
                  className="text-white hover:bg-zinc-800 hover:text-accent transition-colors"
                >
                  <action.icon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{action.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conference?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conference? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

