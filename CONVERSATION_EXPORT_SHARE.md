# Conversation Export and Sharing

## Overview
Enable users to export conference conversations in multiple formats (PDF, Markdown, JSON) and share them via public links or email. This feature enhances collaboration and allows users to preserve and distribute their AI conference outcomes.

## Goals
- Export conversations in PDF, Markdown, and JSON formats
- Generate shareable public links with expiration options
- Email export directly from the app
- Copy conversation to clipboard
- Open conversation in new window for presentation
- Export specific messages or entire conversation

## Database Schema

### Shared Conversations Table
```sql
CREATE TABLE public.shared_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL, -- User who created the share
  title TEXT,
  description TEXT,
  is_public BOOLEAN DEFAULT true,
  password_hash TEXT, -- Optional password protection
  expires_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  max_views INTEGER, -- NULL = unlimited
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shared_conv_token ON shared_conversations(share_token);
CREATE INDEX idx_shared_conv_conversation ON shared_conversations(conversation_id);
CREATE INDEX idx_shared_conv_expires ON shared_conversations(expires_at) WHERE expires_at IS NOT NULL;

-- Function to generate unique share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  token TEXT;
BEGIN
  LOOP
    token := encode(gen_random_bytes(16), 'base64');
    token := replace(replace(replace(token, '+', ''), '/', ''), '=', '');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM shared_conversations WHERE share_token = token);
  END LOOP;
  RETURN token;
END;
$$;

-- Enable RLS
ALTER TABLE public.shared_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own shares"
  ON shared_conversations FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can create shares for their conversations"
  ON shared_conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = conversation_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own shares"
  ON shared_conversations FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own shares"
  ON shared_conversations FOR DELETE
  USING (auth.uid() = created_by);

-- Public access for viewing (no auth required)
CREATE POLICY "Anyone can view non-expired public shares"
  ON shared_conversations FOR SELECT
  USING (
    is_public = true 
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_views IS NULL OR view_count < max_views)
  );
```

### Share Analytics Table (Optional)
```sql
CREATE TABLE public.share_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES shared_conversations(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  viewer_ip TEXT,
  user_agent TEXT,
  referer TEXT
);

-- Index
CREATE INDEX idx_share_views_share ON share_views(share_id);
CREATE INDEX idx_share_views_date ON share_views(viewed_at);

-- No RLS needed - analytics only accessible to share owner
ALTER TABLE public.share_views ENABLE ROW LEVEL SECURITY;
```

### Trigger to Cleanup Expired Shares
```sql
CREATE OR REPLACE FUNCTION cleanup_expired_shares()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.shared_conversations
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;

-- Run daily via cron or pg_cron
-- SELECT cron.schedule('cleanup-expired-shares', '0 2 * * *', 'SELECT cleanup_expired_shares()');
```

## Frontend Implementation

### React Hooks

#### `useSharedConversations.tsx`
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SharedConversation {
  id: string;
  conversation_id: string;
  share_token: string;
  created_by: string;
  title: string | null;
  description: string | null;
  is_public: boolean;
  expires_at: string | null;
  view_count: number;
  max_views: number | null;
  created_at: string;
  updated_at: string;
}

export function useSharedConversations(conversationId: string | null) {
  return useQuery({
    queryKey: ["shared_conversations", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from("shared_conversations")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as SharedConversation[];
    },
    enabled: !!conversationId,
  });
}

export function useCreateShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      title,
      description,
      expiresIn,
      maxViews,
      isPublic,
    }: {
      conversationId: string;
      title?: string;
      description?: string;
      expiresIn?: number; // hours
      maxViews?: number;
      isPublic?: boolean;
    }) => {
      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabase.rpc("create_conversation_share", {
        _conversation_id: conversationId,
        _title: title,
        _description: description,
        _expires_at: expiresAt,
        _max_views: maxViews,
        _is_public: isPublic ?? true,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["shared_conversations", variables.conversationId],
      });
    },
  });
}

export function useDeleteShare() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase
        .from("shared_conversations")
        .delete()
        .eq("id", shareId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shared_conversations"] });
    },
  });
}
```

### Export Utilities

#### `exportConversation.ts`
```typescript
import { Message } from "@/hooks/useMessages";
import { Conversation } from "@/hooks/useConversations";
import jsPDF from "jspdf";

export interface ExportOptions {
  format: "pdf" | "markdown" | "json" | "txt";
  includeTimestamps?: boolean;
  includeMetadata?: boolean;
  title?: string;
}

export async function exportConversation(
  conversation: Conversation,
  messages: Message[],
  options: ExportOptions
) {
  switch (options.format) {
    case "pdf":
      return exportToPDF(conversation, messages, options);
    case "markdown":
      return exportToMarkdown(conversation, messages, options);
    case "json":
      return exportToJSON(conversation, messages, options);
    case "txt":
      return exportToText(conversation, messages, options);
    default:
      throw new Error(`Unsupported format: ${options.format}`);
  }
}

function exportToPDF(
  conversation: Conversation,
  messages: Message[],
  options: ExportOptions
) {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.text(options.title || conversation.title, 20, 20);

  // Metadata
  if (options.includeMetadata) {
    doc.setFontSize(10);
    doc.text(`Created: ${new Date(conversation.created_at).toLocaleString()}`, 20, 30);
    doc.text(`Messages: ${messages.length}`, 20, 35);
  }

  // Messages
  let y = options.includeMetadata ? 45 : 30;
  doc.setFontSize(12);

  messages.forEach((msg) => {
    // Check if we need a new page
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    // Role badge
    doc.setFillColor(msg.role === "user" ? 59 : 147, 130, 246);
    doc.rect(20, y, 30, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(msg.role.toUpperCase(), 22, y + 6);

    // Message content
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(msg.content, 150);
    doc.text(lines, 55, y + 6);

    // Timestamp
    if (options.includeTimestamps) {
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(new Date(msg.created_at).toLocaleString(), 55, y + 6 + lines.length * 6);
    }

    y += lines.length * 6 + 15;
    doc.setFontSize(12);
  });

  // Generate blob
  const blob = doc.output("blob");
  return blob;
}

function exportToMarkdown(
  conversation: Conversation,
  messages: Message[],
  options: ExportOptions
) {
  let markdown = `# ${options.title || conversation.title}\n\n`;

  if (options.includeMetadata) {
    markdown += `**Created:** ${new Date(conversation.created_at).toLocaleString()}\n`;
    markdown += `**Messages:** ${messages.length}\n\n`;
    markdown += "---\n\n";
  }

  messages.forEach((msg) => {
    markdown += `### ${msg.role === "user" ? "👤 User" : "🤖 " + (msg.avatar_id || "Assistant")}\n\n`;
    markdown += `${msg.content}\n\n`;

    if (options.includeTimestamps) {
      markdown += `*${new Date(msg.created_at).toLocaleString()}*\n\n`;
    }

    markdown += "---\n\n";
  });

  const blob = new Blob([markdown], { type: "text/markdown" });
  return blob;
}

function exportToJSON(
  conversation: Conversation,
  messages: Message[],
  options: ExportOptions
) {
  const data = {
    conversation: options.includeMetadata ? conversation : { id: conversation.id, title: conversation.title },
    messages: messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      avatar_id: msg.avatar_id,
      ...(options.includeTimestamps && { created_at: msg.created_at }),
    })),
    exported_at: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  return blob;
}

function exportToText(
  conversation: Conversation,
  messages: Message[],
  options: ExportOptions
) {
  let text = `${options.title || conversation.title}\n${"=".repeat(50)}\n\n`;

  if (options.includeMetadata) {
    text += `Created: ${new Date(conversation.created_at).toLocaleString()}\n`;
    text += `Messages: ${messages.length}\n\n`;
  }

  messages.forEach((msg, i) => {
    text += `[${msg.role.toUpperCase()}${msg.avatar_id ? ` - ${msg.avatar_id}` : ""}]\n`;
    text += `${msg.content}\n`;

    if (options.includeTimestamps) {
      text += `(${new Date(msg.created_at).toLocaleString()})\n`;
    }

    if (i < messages.length - 1) {
      text += `\n${"-".repeat(50)}\n\n`;
    }
  });

  const blob = new Blob([text], { type: "text/plain" });
  return blob;
}

// Helper to download blob
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper to copy to clipboard
export async function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}
```

### UI Components

#### `ExportDialog.tsx`
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Copy, Mail, Share2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { exportConversation, downloadBlob, copyToClipboard } from "@/lib/exportConversation";
import { Conversation } from "@/hooks/useConversations";
import { Message } from "@/hooks/useMessages";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation;
  messages: Message[];
}

export function ExportDialog({ open, onOpenChange, conversation, messages }: ExportDialogProps) {
  const [format, setFormat] = useState<"pdf" | "markdown" | "json" | "txt">("pdf");
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      const blob = await exportConversation(conversation, messages, {
        format,
        includeTimestamps,
        includeMetadata,
      });

      const extension = format === "markdown" ? "md" : format;
      const filename = `${conversation.title.replace(/[^a-z0-9]/gi, "_")}.${extension}`;
      downloadBlob(blob, filename);

      toast({
        title: "Export successful",
        description: `Conversation exported as ${format.toUpperCase()}`,
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopy = async () => {
    try {
      const text = messages
        .map((m) => `[${m.role}] ${m.content}`)
        .join("\n\n");
      
      await copyToClipboard(text);

      toast({
        title: "Copied to clipboard",
        description: "Conversation copied as plain text",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Format</Label>
            <RadioGroup value={format} onValueChange={(v: any) => setFormat(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf">PDF Document</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="markdown" id="markdown" />
                <Label htmlFor="markdown">Markdown</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json">JSON</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="txt" id="txt" />
                <Label htmlFor="txt">Plain Text</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="timestamps"
                checked={includeTimestamps}
                onCheckedChange={(checked) => setIncludeTimestamps(checked as boolean)}
              />
              <Label htmlFor="timestamps">Include timestamps</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="metadata"
                checked={includeMetadata}
                onCheckedChange={(checked) => setIncludeMetadata(checked as boolean)}
              />
              <Label htmlFor="metadata">Include metadata</Label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleExport} className="flex-1">
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button onClick={handleCopy} variant="outline" className="flex-1">
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

#### `ShareDialog.tsx`
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Copy, Link as LinkIcon, Mail } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCreateShare } from "@/hooks/useSharedConversations";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationTitle: string;
}

export function ShareDialog({
  open,
  onOpenChange,
  conversationId,
  conversationTitle,
}: ShareDialogProps) {
  const [title, setTitle] = useState(conversationTitle);
  const [expiresIn, setExpiresIn] = useState<number | undefined>(undefined);
  const [maxViews, setMaxViews] = useState<number | undefined>(undefined);
  const [isPublic, setIsPublic] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const { toast } = useToast();
  const createShare = useCreateShare();

  const handleCreateShare = async () => {
    try {
      const share = await createShare.mutateAsync({
        conversationId,
        title,
        expiresIn,
        maxViews,
        isPublic,
      });

      const url = `${window.location.origin}/shared/${share.share_token}`;
      setShareUrl(url);

      toast({
        title: "Share link created",
        description: "Link copied to clipboard",
      });

      await navigator.clipboard.writeText(url);
    } catch (error) {
      toast({
        title: "Failed to create share",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied to clipboard" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Conversation</DialogTitle>
        </DialogHeader>

        {!shareUrl ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Share title"
              />
            </div>

            <div>
              <Label htmlFor="expires">Expires</Label>
              <Select
                value={expiresIn?.toString() || "never"}
                onValueChange={(v) =>
                  setExpiresIn(v === "never" ? undefined : parseInt(v))
                }
              >
                <SelectTrigger id="expires">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="720">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="public">Public link</Label>
              <Switch
                id="public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            <Button onClick={handleCreateShare} className="w-full">
              <LinkIcon className="mr-2 h-4 w-4" />
              Create Share Link
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Share URL</Label>
              <div className="flex gap-2 mt-2">
                <Input value={shareUrl} readOnly />
                <Button onClick={handleCopyLink} variant="outline" size="icon">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Anyone with this link can view the conversation.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

## Edge Functions

### `create-conversation-share` Function
```sql
CREATE OR REPLACE FUNCTION public.create_conversation_share(
  _conversation_id UUID,
  _title TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _max_views INTEGER DEFAULT NULL,
  _is_public BOOLEAN DEFAULT true
)
RETURNS shared_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _share shared_conversations;
BEGIN
  -- Check user owns conversation
  IF NOT EXISTS (
    SELECT 1 FROM conversations 
    WHERE id = _conversation_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO shared_conversations (
    conversation_id,
    share_token,
    created_by,
    title,
    description,
    expires_at,
    max_views,
    is_public
  )
  VALUES (
    _conversation_id,
    generate_share_token(),
    auth.uid(),
    COALESCE(_title, (SELECT title FROM conversations WHERE id = _conversation_id)),
    _description,
    _expires_at,
    _max_views,
    _is_public
  )
  RETURNING * INTO _share;

  RETURN _share;
END;
$$;
```

## Public Share Page

### `/shared/[token]` Route
```typescript
// src/pages/SharedConversation.tsx
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Message } from "@/hooks/useMessages";

export default function SharedConversation() {
  const { token } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared", token],
    queryFn: async () => {
      // Fetch share metadata
      const { data: share, error: shareError } = await supabase
        .from("shared_conversations")
        .select("*, conversation:conversations(*)")
        .eq("share_token", token)
        .single();

      if (shareError) throw shareError;

      // Increment view count
      await supabase.rpc("increment_share_views", { _share_id: share.id });

      // Fetch messages
      const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", share.conversation_id)
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;

      return { share, messages };
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Share not found or expired</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">{data.share.title}</h1>
      {data.share.description && (
        <p className="text-muted-foreground mb-8">{data.share.description}</p>
      )}

      <div className="space-y-4">
        {data.messages.map((message: Message) => (
          <div key={message.id} className="border rounded-lg p-4">
            <div className="font-semibold mb-2">{message.role}</div>
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        Shared via SyncTeamAI
      </div>
    </div>
  );
}
```

## Implementation Phases

### Phase 1: Basic Export
- [ ] Implement export utilities (PDF, MD, JSON, TXT)
- [ ] Create ExportDialog component
- [ ] Add export button to Conference page
- [ ] Test all export formats

### Phase 2: Share Links
- [ ] Create shared_conversations table
- [ ] Implement share creation function
- [ ] Build ShareDialog component
- [ ] Create public share viewer page

### Phase 3: Advanced Features
- [ ] Add password protection
- [ ] Implement view analytics
- [ ] Add email export
- [ ] Create share management page

### Phase 4: Polish
- [ ] Add social media sharing
- [ ] Implement QR code generation
- [ ] Add export templates/themes
- [ ] Performance optimization

## Testing Checklist

- [ ] Export generates valid PDF
- [ ] Markdown export readable in editors
- [ ] JSON export valid and importable
- [ ] Share links work without authentication
- [ ] Expired shares show error
- [ ] View count increments correctly
- [ ] Max views limit enforced
- [ ] Password protection works
- [ ] Copy to clipboard works
- [ ] Email export sends successfully

## Future Enhancements
- Import conversations from JSON
- Batch export multiple conversations
- Share collections/folders
- Embeddable conversation widgets
- White-label export branding for paid users
- Export to Notion, Google Docs, etc.
