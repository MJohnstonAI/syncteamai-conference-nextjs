import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleDashed,
  KeyRound,
  Loader2,
  Mail,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useLocation, useNavigate } from "@/lib/router";
import { HomeIcon } from "@/components/HomeIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useBYOK } from "@/hooks/useBYOK";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { authedFetch } from "@/lib/auth-token";

type StepStatus = "pending" | "success" | "failed";

const parseHashError = () => {
  if (!window.location.hash.startsWith("#")) {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  const hashError = hashParams.get("error_description") ?? hashParams.get("error");
  if (!hashError) {
    return null;
  }

  try {
    return decodeURIComponent(hashError.replace(/\+/g, " "));
  } catch {
    return hashError;
  }
};

const StepIndicator = ({ status }: { status: StepStatus }) => {
  if (status === "success") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Success" />;
  }
  if (status === "failed") {
    return <XCircle className="h-5 w-5 text-red-600" aria-label="Failed" />;
  }
  return <CircleDashed className="h-5 w-5 text-slate-400" aria-label="Pending" />;
};

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    hasStoredOpenRouterKey,
    hasDevFallbackOpenRouterKey,
    hasConfiguredOpenRouterKey,
    keyLast4,
    lastValidatedAt,
    lastValidationStatus,
    lastValidationError,
    needsRevalidation,
    isLoadingKeyStatus,
    setStoredKeyStatus,
    refreshStoredKeyStatus,
  } = useBYOK();

  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null);

  const [keyInput, setKeyInput] = useState("");
  const [isSavingByok, setIsSavingByok] = useState(false);
  const [isRemovingByok, setIsRemovingByok] = useState(false);
  const [byokError, setByokError] = useState<string | null>(null);
  const byokSectionRef = useRef<HTMLDivElement | null>(null);

  const authParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const nextPath = useMemo(() => {
    return authParams.get("action") === "subscribe" ? "/subscribe" : "/templates";
  }, [authParams]);

  const continuePath = useMemo(() => {
    const returnTo = authParams.get("return_to");
    if (returnTo && returnTo.startsWith("/")) {
      return returnTo;
    }
    return nextPath;
  }, [authParams, nextPath]);

  const requestedStep = authParams.get("step");

  const magicLinkStatus: StepStatus = user ? "success" : magicLinkError ? "failed" : "pending";
  const byokStatus: StepStatus = !user
    ? "pending"
    : hasConfiguredOpenRouterKey
      ? lastValidationStatus === "failed"
        ? "failed"
        : "success"
      : byokError
        ? "failed"
        : "pending";

  useEffect(() => {
    const hashError = parseHashError();
    if (!hashError) return;

    setMagicLinkError(hashError);
    toast({
      title: "Sign-in failed",
      description: hashError,
      variant: "destructive",
    });
  }, [toast]);

  useEffect(() => {
    if (!user) return;
    setMagicLinkError(null);
  }, [user]);

  useEffect(() => {
    if (requestedStep !== "2") return;
    byokSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [requestedStep]);

  const onMagicLinkSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || isSending) return;

    setMagicLinkError(null);
    setIsSending(true);
    try {
      const emailRedirectTo = `${window.location.origin}/auth${location.search}`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        throw error;
      }

      setLinkSent(true);
      toast({
        title: "Magic link sent",
        description: "Check your inbox to finish signing in.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected authentication error.";
      setMagicLinkError(message);
      toast({
        title: "Unable to send magic link",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveByok = async () => {
    if (!user) {
      const message = "Sign in with magic link before saving OpenRouter BYOK.";
      setByokError(message);
      toast({
        title: "Sign-in required",
        description: message,
        variant: "destructive",
      });
      return;
    }

    const trimmed = keyInput.trim();
    const needsKey = !trimmed;

    if (needsKey) {
      const message = "Paste an OpenRouter key before saving.";
      setByokError(message);
      toast({
        title: "API Key Required",
        description: message,
        variant: "destructive",
      });
      return;
    }

    setIsSavingByok(true);
    setByokError(null);
    try {
      const response = await authedFetch("/api/settings/byok", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openrouter",
          key: trimmed,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        hasStoredKey?: boolean;
        keyLast4?: string | null;
        hasDevFallbackKey?: boolean;
        lastValidatedAt?: string | null;
        lastValidationStatus?: "unknown" | "success" | "failed";
        lastValidationError?: string | null;
        needsRevalidation?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to save BYOK settings.");
      }

      setStoredKeyStatus({
        hasStoredKey: Boolean(payload.hasStoredKey),
        keyLast4: payload.keyLast4 ?? null,
        hasDevFallbackKey: payload.hasDevFallbackKey,
        lastValidatedAt: payload.lastValidatedAt ?? null,
        lastValidationStatus: payload.lastValidationStatus ?? "unknown",
        lastValidationError: payload.lastValidationError ?? null,
        needsRevalidation: payload.needsRevalidation ?? false,
      });

      setKeyInput("");
      toast({
        title: "BYOK saved",
        description: "OpenRouter key setup is complete.",
      });
      await refreshStoredKeyStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save BYOK settings.";
      setByokError(message);
      toast({
        title: "BYOK setup failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSavingByok(false);
    }
  };

  const handleRemoveByok = async () => {
    if (!user) return;

    setIsRemovingByok(true);
    setByokError(null);
    try {
      const response = await authedFetch("/api/settings/byok", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove OpenRouter key.");
      }

      setStoredKeyStatus({
        hasStoredKey: false,
        keyLast4: null,
        lastValidatedAt: null,
        lastValidationStatus: "unknown",
        lastValidationError: null,
        needsRevalidation: false,
      });
      setKeyInput("");
      await refreshStoredKeyStatus();
      toast({
        title: "BYOK removed",
        description: "Stored BYOK data has been cleared.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove BYOK key.";
      setByokError(message);
      toast({
        title: "BYOK removal failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRemovingByok(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="fixed left-6 top-6 z-50">
        <HomeIcon />
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-5 pt-14">
        <Card>
          <CardHeader className="space-y-2">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Sign-in & model access
            </div>
            <CardTitle className="text-3xl">Complete both steps before conference runs</CardTitle>
            <CardDescription>
              Step (1) verifies your account. Step (2) verifies OpenRouter BYOK.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">(1) Magic Link sign-in</CardTitle>
              <StepIndicator status={magicLinkStatus} />
            </div>
            <CardDescription>Send a secure sign-in link to your email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onMagicLinkSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              {linkSent ? (
                <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                  Magic link sent. Open the email on this device to complete sign-in.
                </p>
              ) : null}

              {magicLinkError ? (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                  {magicLinkError}
                </p>
              ) : null}

              {user ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Magic link sign-in complete.
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={isSending || !email.trim()}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending link...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Email me a magic link
                  </>
                )}
              </Button>

              {user ? (
                <Button type="button" variant="outline" className="w-full" onClick={() => navigate(continuePath)}>
                  Continue
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card ref={byokSectionRef}>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-xl">
                <KeyRound className="h-5 w-5" />
                (2) OpenRouter BYOK
              </CardTitle>
              <StepIndicator status={byokStatus} />
            </div>
            <CardDescription>
              Connect your OpenRouter key to enable agent replies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!user ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Sign in first, then complete BYOK.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border px-2 py-1">
                {hasConfiguredOpenRouterKey ? "BYOK configured" : "BYOK not configured"}
              </span>
              {isLoadingKeyStatus ? <span className="text-muted-foreground">Checking status...</span> : null}
              {hasStoredOpenRouterKey && keyLast4 ? (
                <span className="text-muted-foreground">Stored key ending in {keyLast4}</span>
              ) : null}
              {lastValidatedAt ? (
                <span className="text-muted-foreground">
                  Last verified {new Date(lastValidatedAt).toLocaleString()}
                </span>
              ) : null}
              {lastValidationStatus === "failed" ? (
                <span className="text-red-600">
                  Verification failed{lastValidationError ? `: ${lastValidationError}` : "."}
                </span>
              ) : null}
              {needsRevalidation ? (
                <span className="text-muted-foreground">Verification refresh pending</span>
              ) : null}
              {hasDevFallbackOpenRouterKey ? (
                <span className="text-muted-foreground">Dev fallback key active</span>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="openrouter-key">OpenRouter API Key</Label>
              <Input
                id="openrouter-key"
                type="password"
                placeholder="sk-or-v1-..."
                value={keyInput}
                onChange={(event) => setKeyInput(event.target.value)}
                disabled={!user || isSavingByok || isRemovingByok}
              />
            </div>

            {byokError ? (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {byokError}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSaveByok} disabled={!user || isSavingByok || isRemovingByok}>
                {isSavingByok ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save BYOK"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleRemoveByok}
                disabled={!user || isSavingByok || isRemovingByok}
              >
                {isRemovingByok ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Removing...
                  </>
                ) : (
                  "Remove BYOK"
                )}
              </Button>
              {user ? (
                <Button type="button" variant="ghost" onClick={() => navigate(continuePath)}>
                  Continue
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
