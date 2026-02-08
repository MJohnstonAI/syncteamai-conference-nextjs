import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "@/lib/router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ActionRail } from "@/components/ActionRail";
import { AvatarList } from "@/components/AvatarList";
import { ConversationHistory } from "@/components/ConversationHistory";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Sparkles, Key, ImagePlus, Paperclip, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCreateConversation, useConversation } from "@/hooks/useConversations";
import { useMessages, useSendMessage } from "@/hooks/useMessages";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TokenLimitWidget } from "@/components/TokenLimitWidget";
import { useUserRole } from "@/hooks/useUserRole";
import { useBYOK } from "@/hooks/useBYOK";
import { authedFetch } from "@/lib/auth-token";
import { ModelSelectionDropdown } from "@/components/ModelSelectionDropdown";
import { BYOKModal } from "@/components/BYOKModal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

const DEFAULT_TOKEN_LIMITS: Record<string, number> = {
  pending: 5000,
  free: 25000,
  paid: 25000,
  cancelled: 5000,
  admin: 50000,
};

type SupabaseErrorPayload = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: string | number;
};

const getReadableError = (
  error: unknown,
  fallback = "Failed to complete the requested action."
) => {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  if (typeof error === "object") {
    const { message, details, hint, code } = error as SupabaseErrorPayload;
    const parts = [
      message,
      details,
      hint,
      code ? `Code: ${code}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return fallback;
};



const Conference = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: userRole } = useUserRole();
  const { 
    openRouterKey,
    hasConfiguredOpenRouterKey,
    selectedModels,
    activeModels,
    avatarOrder,
    getModelForAvatar,
    setSelectedModels,
  } = useBYOK();
  const [inputValue, setInputValue] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedAvatars, setSelectedAvatars] = useState<string[]>(["llama", "qwen"]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showBYOKModal, setShowBYOKModal] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<Array<{ name: string; content: string; type: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const hasCreatedConversation = useRef(false);
  
  // Token tracking state
  const [sessionTokens, setSessionTokens] = useState(0);
  const [tokenLimit, setTokenLimit] = useState<number>(() => DEFAULT_TOKEN_LIMITS[(userRole ?? 'pending')] || 5000);
  const [isConferenceAdjourned, setIsConferenceAdjourned] = useState(false);

  // Multi-role mode state
  const [multiRoleMode, setMultiRoleMode] = useState(false);
  const [selectedRole, setSelectedRole] = useState("1");


  
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0);
  const [modelDownloadStage, setModelDownloadStage] = useState<string>("");
  const [currentDownloadingModel, setCurrentDownloadingModel] = useState<string>("");
  const [modelError, setModelError] = useState<string>("");
  const [freeMessageCount, setFreeMessageCount] = useState(0);

  const effectiveRole = userRole ?? "pending";
  const isAdminRole = effectiveRole === "admin";
  const isPaidRole = effectiveRole === "paid";
  const isFreeRole = effectiveRole === "free";
  const hasPrivilegedAccess = isAdminRole || isPaidRole || isFreeRole;

  // Context overflow state




  const title = searchParams.get("title") || "Conference";
  const script = searchParams.get("script") || "";
  const promptScriptId = searchParams.get("prompt_id");
  const promptOwnerId = searchParams.get("prompt_user_id");

  const createConversation = useCreateConversation();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(conversationId);
  const { data: conversation } = useConversation(conversationId);
  const sendMessage = useSendMessage();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  // Create conversation on mount if coming from template
  useEffect(() => {
    // Prevent double execution
    if (hasCreatedConversation.current) return;
    
    if (user && !conversationId && title && !searchParams.get("conversation_id")) {
      hasCreatedConversation.current = true;
      
      createConversation.mutate(
        {
          title,
          script: script || undefined,
          promptScriptId: promptScriptId || undefined,
          overrideUserId: promptOwnerId || undefined,
        },
        {
          onSuccess: (data) => {
            setConversationId(data.id);
            navigate(`/conference?conversation_id=${data.id}`, { replace: true });
            if (script) {
              setInputValue(script);
            }
          },
          onError: (error) => {
            hasCreatedConversation.current = false; // Reset on error
            toast({
              title: "Error",
              description: getReadableError(
                error,
                "Failed to create conversation."
              ),
              variant: "destructive",
            });
            console.error(error);
          },
        }
      );
    }
  }, [
    user,
    conversationId,
    title,
    createConversation,
    navigate,
    script,
    promptScriptId,
    promptOwnerId,
    searchParams,
    toast,
  ]);

  // Load conversation from URL
  useEffect(() => {
    const conversationIdFromUrl = searchParams.get("conversation_id");
    if (conversationIdFromUrl && conversationIdFromUrl !== conversationId) {
      setConversationId(conversationIdFromUrl);
    }
  }, [searchParams, conversationId]);

  // Reset conversation creation flag on unmount
  useEffect(() => {
    return () => {
      hasCreatedConversation.current = false;
    };
  }, []);

  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDocumentUpload = () => {
    documentInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setUploadedImage(base64);
      toast({
        title: "Image Uploaded",
        description: "Image will be sent with your next message",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDocumentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newDocuments: Array<{ name: string; content: string; type: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileType = file.type;
      const fileName = file.name;
      const fileExt = fileName.split('.').pop()?.toLowerCase();

      // Check if file type is supported
      const supportedExtensions = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'md', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'gif'];
      if (!fileExt || !supportedExtensions.includes(fileExt)) {
        toast({
          title: "Unsupported File",
          description: `${fileName} is not a supported file type`,
          variant: "destructive",
        });
        continue;
      }

      try {
        // For text-based files, read directly
        if (['md', 'csv', 'txt'].includes(fileExt)) {
          const text = await file.text();
          newDocuments.push({
            name: fileName,
            content: text,
            type: fileExt,
          });
        }
        // For images, convert to base64
        else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(fileExt)) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = (event) => resolve(event.target?.result as string);
            reader.readAsDataURL(file);
          });
          newDocuments.push({
            name: fileName,
            content: base64,
            type: 'image',
          });
        }
        // For binary documents (PDF, Word, Excel), show placeholder
        // Note: Full parsing would require backend processing
        else {
          newDocuments.push({
            name: fileName,
            content: `[${fileExt.toUpperCase()} Document: ${fileName}]\n\nNote: Document content will be processed when sent to AI agents.`,
            type: fileExt,
          });
        }
      } catch (error) {
        toast({
          title: "Error Reading File",
          description: `Failed to read ${fileName}`,
          variant: "destructive",
        });
      }
    }

    if (newDocuments.length > 0) {
      setUploadedDocuments((prev) => [...prev, ...newDocuments]);
      toast({
        title: "Documents Uploaded",
        description: `${newDocuments.length} document(s) will be sent with your next message`,
      });
    }

    // Reset input
    if (documentInputRef.current) {
      documentInputRef.current.value = '';
    }
  };

  const removeDocument = (index: number) => {
    setUploadedDocuments((prev) => prev.filter((_, i) => i !== index));
  };

  // Upsell effect for users without full access
  useEffect(() => {
    if (freeMessageCount >= 10 && !hasPrivilegedAccess) {
      toast({
        title: "Enjoying SyncTeamAI?",
        description: "Upgrade to access GPT-5, Claude, and Gemini with your own API key",
        action: <Button onClick={() => navigate("/pricing")} size="sm">View Plans</Button>,
      });
    }
  }, [freeMessageCount, hasPrivilegedAccess, navigate, toast]);

  // Parse message to detect addressed agents
  const parseAddressedAgents = (message: string): string[] => {
    const avatarNames: Record<string, string[]> = {
      "1": ["strategy", "chatgpt", "gpt", "chat gpt"],
      "chatgpt": ["strategy", "chatgpt", "gpt", "chat gpt"],
      "2": ["creative", "claude"],
      "claude": ["creative", "claude"],
      "3": ["analyst", "gemini"],
      "gemini": ["analyst", "gemini"],
      "4": ["technical", "grok"],
      "grok": ["technical", "grok"],
      "llama": ["llama"],
      "mistral": ["mistral"],
      "gemma": ["gemma"],
      "qwen": ["qwen"],
    };

    const lowerMessage = message.toLowerCase();
    const addressed: string[] = [];

    for (const [avatarId, aliases] of Object.entries(avatarNames)) {
      for (const alias of aliases) {
        // Check for patterns like "Grok, please..." or "Hey Claude..." or "Qwen can you..."
        const patterns = [
          new RegExp(`\\b${alias}[,:]`, 'i'),           // "Grok," or "Grok:"
          new RegExp(`\\b${alias}\\s+(please|can|could|would|tell|give|what|how|play|be)`, 'i'), // "Grok please" or "Grok can you" or "Grok play the role"
          new RegExp(`(hey|hi)\\s+${alias}`, 'i'),      // "Hey Grok"
        ];
        
        if (patterns.some(pattern => pattern.test(lowerMessage))) {
          if (!addressed.includes(avatarId)) {
            addressed.push(avatarId);
          }
          break;
        }
      }
    }

    return addressed;
  };

  const handleSend = async (overrideContent?: string) => {
    let userContent = overrideContent || inputValue;
    if (uploadedDocuments.length > 0 && !overrideContent) {
      const documentContext = uploadedDocuments
        .map((doc) => '\n\n--- ' + doc.name + ' ---\n' + (doc.type === 'image' ? '[Image attached]' : doc.content))
        .join('\n');
      userContent = userContent + documentContext;
    }
    if (!userContent.trim() || !conversationId || isAiThinking) return;

    if (!overrideContent) {
      setInputValue('');
      setUploadedDocuments([]);
    }

    try {
      const userMessage = await sendMessage.mutateAsync({
        conversationId,
        role: 'user',
        content: userContent,
      });
      setIsAiThinking(true);

      const role = userRole ?? 'pending';
      const isAdmin = role === 'admin';
      const isPaid = role === 'paid';
      const isFree = role === 'free';
      const hasSeat = isAdmin || isPaid || isFree;

      const modelsToCall = activeModels;
      if (!hasConfiguredOpenRouterKey || !hasSeat) {
        toast({
          title: 'BYOK Required',
          description: 'Add your OpenRouter API key in Settings to continue.',
          variant: 'destructive',
        });
        setIsAiThinking(false);
        return;
      }

      const orderedAvatarIds = avatarOrder.filter((id) => {
        const mid = getModelForAvatar(id);
        return mid && modelsToCall.includes(mid);
      });

      const transcript = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));
      transcript.push({ role: 'user', content: userContent });

      for (const avatarId of orderedAvatarIds) {
        const modelId = getModelForAvatar(avatarId);
        if (!modelId) continue;

        const idempotencyKey = `${conversationId}:${userMessage.id}:${avatarId}:${modelId}`;
        const response = await authedFetch('/api/ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-idempotency-key': idempotencyKey,
          },
          body: JSON.stringify({
            conversationId,
            roundId: userMessage.id,
            messages: transcript,
            selectedAvatar: avatarId,
            modelId,
            openRouterKey: openRouterKey ?? undefined,
            idempotencyKey,
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          response?: string;
          retryAfterSec?: number;
        };

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = payload.retryAfterSec ?? 10;
            throw new Error(`Rate limited. Retry in ${retryAfter}s.`);
          }
          if (response.status === 403) {
            throw new Error(payload.error || 'Access required to generate responses.');
          }
          if (response.status === 503) {
            throw new Error('OpenRouter is busy right now. Please retry in a moment.');
          }
          throw new Error(payload.error || `Generation failed with ${response.status}`);
        }

        const aiContent = payload.response || 'No response';
        await sendMessage.mutateAsync({ conversationId, role: 'assistant', content: aiContent, avatarId });
        transcript.push({ role: 'assistant', content: aiContent });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsAiThinking(false);
    }
  }; 
  const handleToggleAvatar = (id: string) => {
    setSelectedAvatars(prev =>
      prev.includes(id) ? prev.filter(aid => aid !== id) : [...prev, id]
    );
  };

  const handleNewConversation = () => {
    setConversationId(null);
    setSessionTokens(0);
    setIsConferenceAdjourned(false);
    navigate("/conference");
  };

  const handleSelectConversation = (convId: string) => {
    setConversationId(convId);
    navigate(`/conference?conversation_id=${convId}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!user) {
    return null;
  }

  const avatarMap: Record<string, { image: string; color: string; name: string }> = {
    "chatgpt": { image: "/images/avatars/chatgpt.png", color: "#10A37F", name: "ChatGPT" },
    "claude": { image: "/images/avatars/claude.png", color: "#CC785C", name: "Claude" },
    "gemini": { image: "/images/avatars/gemini.png", color: "#4285F4", name: "Gemini" },
    "grok": { image: "/images/avatars/grok.png", color: "#000000", name: "Grok" },
    "llama": { image: "/images/avatars/llama.png", color: "#0064E0", name: "Llama" },
    "qwen": { image: "/images/avatars/qwen.png", color: "#FF6A00", name: "Qwen" },
  };

  return (
    <div className="h-screen flex bg-background" data-conference-page>
      <ActionRail 
        conversationId={conversationId || undefined}
        messages={messages || []}
        conversationTitle={conversation?.title}
      />
      <AvatarList 
        onAvatarClick={() => setShowBYOKModal(true)}
        userRole={userRole}
      />
      
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Conversation History - Resizable */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <ConversationHistory
            currentConversationId={conversationId}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
          />
        </ResizablePanel>

        {/* Resize Handle */}
        <ResizableHandle withHandle />

        {/* Chat Panel - Resizable */}
        <ResizablePanel defaultSize={80} minSize={50}>
          <main className="flex flex-col h-full">
        {/* BYOK Upsell for Paid Users */}
        {hasPrivilegedAccess && !hasConfiguredOpenRouterKey && (
          <Alert className="mx-6 mt-4">
            <Key className="h-4 w-4" />
            <AlertTitle>Unlock Premium AI</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>Activate your OpenAI/Anthropic/Google key to access industry-leading models</span>
              <Button onClick={() => setShowBYOKModal(true)} size="sm" className="ml-4">
                Activate BYOK
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <header className="border-b px-6 py-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{title || "AI Conference"}</h1>
              {hasConfiguredOpenRouterKey && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Key className="h-3 w-3" />
                  BYOK: OpenRouter
                  {multiRoleMode && <span className="ml-1">• Multi-Role</span>}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4">
              {/* Multi-Role Mode Toggle for BYOK Paid Users */}
              {hasConfiguredOpenRouterKey && hasPrivilegedAccess && (
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                  <span className="text-sm font-medium">Multi-Role</span>
                  <Switch 
                    checked={multiRoleMode} 
                    onCheckedChange={setMultiRoleMode}
                  />
                  {multiRoleMode && (
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Strategy</SelectItem>
                        <SelectItem value="2">Creative</SelectItem>
                        <SelectItem value="3">Analyst</SelectItem>
                        <SelectItem value="4">Technical</SelectItem>
                        <SelectItem value="5">Research</SelectItem>
                        <SelectItem value="6">Design</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
              
              {hasPrivilegedAccess ? (
                <Button variant="outline" size="sm" onClick={() => setShowBYOKModal(true)}>
                  <Key className="h-4 w-4 mr-2" />
                  {hasConfiguredOpenRouterKey ? "Manage BYOK" : "Enable BYOK"}
                </Button>
              ) : null}
              <TokenLimitWidget
                currentTokens={sessionTokens}
                limitTokens={tokenLimit}
                onLimitChange={setTokenLimit}
                isAdjourned={isConferenceAdjourned}
                userTier={userRole}
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                {selectedAvatars.length} agent{selectedAvatars.length !== 1 ? "s" : ""} active
              </div>
            </div>
          </div>
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 px-6 py-4">
          {messagesLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md space-y-4">
                <div className="text-6xl mb-4">🎭</div>
                <h2 className="text-xl font-semibold mb-2">Multi-Agent AI Conference</h2>
                <p className="text-muted-foreground">
                  Select AI agents from the sidebar and start a conversation. Multiple agents will respond with their unique perspectives.
                </p>
                {selectedAvatars.length === 0 && (
                  <p className="text-sm text-destructive">
                    Please select at least one agent to begin.
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <div className="space-y-6 max-w-4xl mx-auto w-full">
            {messages.map((message) => {
              const avatar = message.avatar_id ? avatarMap[message.avatar_id] : null;
              
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && avatar && (
                    <Avatar className="h-10 w-10 shrink-0 border-2" style={{ borderColor: avatar.color }}>
                      <img src={avatar.image} alt={avatar.name} className="w-full h-full object-cover" />
                    </Avatar>
                  )}
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {message.role === "assistant" && avatar && (
                      <div className="text-xs font-semibold mb-1 opacity-70">{avatar.name} AI</div>
                    )}
                    <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ node, ...props }) => (
                            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" />
                          ),
                          img: ({ node, ...props }) => (
                            <img {...props} className="max-w-full rounded-lg shadow-lg my-2" />
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                    <span className="text-xs opacity-60 mt-2 block">
                      {new Date(message.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {message.role === "user" && (
                    <Avatar className="h-10 w-10 shrink-0 bg-primary">
                      <AvatarFallback className="text-primary-foreground">You</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
            {isAiThinking && (
              <div className="flex gap-3">
                <div className="flex gap-2">
                  {selectedAvatars.map(id => {
                    const avatar = avatarMap[id];
                    if (!avatar) return null;
                    return (
                      <Avatar key={id} className="h-10 w-10 animate-pulse border-2" style={{ borderColor: avatar.color }}>
                        <img src={avatar.image} alt={avatar.name} className="w-full h-full object-cover" />
                      </Avatar>
                    );
                  })}
                </div>
                <div className="bg-muted rounded-lg px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t p-4 bg-muted/30">
          <div className="max-w-4xl mx-auto mb-3">
            <ModelSelectionDropdown
              selectedModels={selectedModels}
              onSelectionChange={setSelectedModels}
              disabled={!hasConfiguredOpenRouterKey || !hasPrivilegedAccess}
            />
          </div>
          <div className="flex gap-3 max-w-4xl mx-auto">
            <div className="flex-1 space-y-2">
              {uploadedImage && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                  <ImagePlus className="h-4 w-4" />
                  Image attached
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadedImage(null)}
                    className="ml-auto h-6 px-2"
                  >
                    Remove
                  </Button>
                </div>
              )}
              {uploadedDocuments.length > 0 && (
                <div className="space-y-1">
                  {uploadedDocuments.map((doc, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                      <Paperclip className="h-4 w-4" />
                      <span className="flex-1 truncate">{doc.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(index)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Textarea
                placeholder={
                  isConferenceAdjourned
                    ? "Conference adjourned - token limit reached"
                    : selectedAvatars.length === 0
                    ? "Select at least one agent to start..."
                    : "Ask your question to the AI agents..."
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                className="min-h-[100px] resize-none"
                disabled={isAiThinking || !conversationId || selectedAvatars.length === 0 || isConferenceAdjourned}
              />
            </div>
            <div className="flex flex-col gap-2">
              {hasConfiguredOpenRouterKey && (
                <Button
                  onClick={handleImageUpload}
                  size="icon"
                  variant="outline"
                  className="w-12 h-12 shrink-0"
                  disabled={isAiThinking || !conversationId || isConferenceAdjourned}
                  title="Upload image for AI analysis"
                >
                  <ImagePlus className="h-5 w-5" />
                </Button>
              )}
              <Button 
                onClick={() => handleSend()} 
                size="icon" 
                className="w-12 h-12 shrink-0"
                disabled={isAiThinking || !conversationId || !inputValue.trim() || selectedAvatars.length === 0 || isConferenceAdjourned}
              >
                {isAiThinking ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
              <Button
                onClick={handleDocumentUpload}
                size="icon"
                variant="outline"
                className="w-12 h-12 shrink-0"
                disabled={isAiThinking || !conversationId || isConferenceAdjourned}
                title="Upload documents (Word, Excel, PDF, .md, .csv, .txt, images)"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.md,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif"
          multiple
          className="hidden"
          onChange={handleDocumentChange}
        />
        <BYOKModal open={showBYOKModal} onOpenChange={setShowBYOKModal} />

      </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default Conference;







