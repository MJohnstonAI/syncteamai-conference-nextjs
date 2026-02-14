import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  KeyRound,
  Loader2,
  Mail,
  XCircle,
} from "lucide-react";
import { useLocation, useNavigate } from "@/lib/router";
import { HomeIcon } from "@/components/HomeIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useBYOK } from "@/hooks/useBYOK";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { authedFetch } from "@/lib/auth-token";
import { cn } from "@/lib/utils";

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
  const returnPath = useMemo(() => {
    const returnTo = authParams.get("return_to");
    if (returnTo && returnTo.startsWith("/")) {
      return returnTo;
    }
    return "/templates";
  }, [authParams]);

  const magicLinkStatus: StepStatus = user ? "success" : magicLinkError ? "failed" : "pending";
  const byokStatus: StepStatus = !user
    ? "pending"
    : lastValidationStatus === "failed" || byokError
      ? "failed"
      : hasConfiguredOpenRouterKey && lastValidationStatus === "success" && !needsRevalidation
        ? "success"
      : byokError
        ? "failed"
        : "pending";
  const canContinue = magicLinkStatus === "success" && byokStatus === "success";

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
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-6 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-[45%] w-[45%] rounded-full bg-blue-100/80 blur-[110px]" />
        <div className="absolute -bottom-[12%] -right-[10%] h-[45%] w-[45%] rounded-full bg-indigo-100/70 blur-[110px]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <HomeIcon />
          <Button type="button" variant="ghost" className="h-10 rounded-xl px-4" onClick={() => navigate(returnPath)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <aside className="hidden flex-col pt-12 lg:col-span-5 lg:flex">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-white"
                  aria-hidden="true"
                >
                  <path
                    d="M16 11C17.6569 11 19 9.65685 19 8C19 6.34315 17.6569 5 16 5C14.3431 5 13 6.34315 13 8C13 9.65685 14.3431 11 16 11Z"
                    fill="currentColor"
                  />
                  <path
                    d="M8 12C9.65685 12 11 10.6569 11 9C11 7.34315 9.65685 6 8 6C6.34315 6 5 7.34315 5 9C5 10.6569 6.34315 12 8 12Z"
                    fill="currentColor"
                  />
                  <path
                    d="M8 14C5.79086 14 4 15.7909 4 18V19H12V18C12 15.7909 10.2091 14 8 14Z"
                    fill="currentColor"
                  />
                  <path
                    d="M16 13C13.7909 13 12 14.7909 12 17V19H20V17C20 14.7909 18.2091 13 16 13Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">SyncTeamAI</h1>
            </div>
            <h2 className="mb-5 text-4xl font-extrabold leading-tight text-slate-900">
              Unlock the power of
              <span className="block text-blue-600">AI Collaboration</span>
            </h2>
            <p className="mb-8 text-xl leading-relaxed text-slate-600">
              Connect your own API keys and start building intelligent multi-agent workflows in minutes.
              Secure, collaborative, and developer-first.
            </p>
            <ul className="space-y-4 text-base text-slate-700">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Bring Your Own Key (BYOK) architecture
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                End-to-end encrypted storage
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Instant access to GPT-4, Claude, and more
              </li>
            </ul>
          </aside>

          <main className="col-span-1 mx-auto w-full max-w-3xl lg:col-span-7 lg:max-w-none">
            <div className="relative mb-8 flex items-center justify-between">
              <div className="absolute inset-x-0 top-2.5 h-0.5 bg-slate-200" />
              <div className="relative z-10 flex flex-col items-center gap-2 bg-slate-50 px-2">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-slate-50",
                    magicLinkStatus === "success"
                      ? "bg-emerald-500 text-white"
                      : magicLinkStatus === "failed"
                        ? "bg-red-500 text-white"
                        : "bg-blue-600 text-blue-600"
                  )}
                >
                  {magicLinkStatus === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {magicLinkStatus === "failed" ? <XCircle className="h-3.5 w-3.5" /> : null}
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Account</span>
              </div>
              <div className="relative z-10 flex flex-col items-center gap-2 bg-slate-50 px-2">
                <div
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-slate-50",
                    byokStatus === "success"
                      ? "bg-emerald-500 text-white"
                      : byokStatus === "failed"
                        ? "bg-red-500 text-white"
                        : "bg-slate-300 text-slate-300"
                  )}
                >
                  {byokStatus === "success" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  {byokStatus === "failed" ? <XCircle className="h-3.5 w-3.5" /> : null}
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Configuration
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/50">
                <div className="p-8">
                  <div className="mb-6 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900">Sign in to your account</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        We&apos;ll send you a magic link for a password-free sign in.
                      </p>
                    </div>
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Step 1 of 2
                    </span>
                  </div>

                  <form onSubmit={onMagicLinkSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                        Email address
                      </Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="h-11 border-slate-300 pl-10"
                          required
                        />
                      </div>
                    </div>

                    {linkSent ? (
                      <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        Magic link sent. Open the email on this device to complete sign-in.
                      </p>
                    ) : null}

                    {magicLinkError ? (
                      <p className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <XCircle className="h-4 w-4" />
                        {magicLinkError}
                      </p>
                    ) : null}

                    {user ? (
                      <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Magic link sign-in verified.
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      disabled={isSending || !email.trim()}
                      className="h-11 w-full bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending link...
                        </>
                      ) : (
                        "Send Magic Link"
                      )}
                    </Button>
                  </form>
                </div>

                <div className="border-t border-slate-100 bg-slate-50 px-8 py-4 text-center text-xs text-slate-500">
                  By signing in, you agree to our terms and
                  <a href="/privacy" className="ml-1 text-blue-600 hover:underline">
                    Privacy Policy
                  </a>
                  .
                </div>
              </section>

              <section
                ref={byokSectionRef}
                className={cn(
                  "relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
                  !user && "opacity-60"
                )}
              >
                {!user ? (
                  <div className="absolute inset-0 z-10 flex cursor-not-allowed items-center justify-center bg-slate-50/70 backdrop-blur-[1px]">
                    <p className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Complete step 1 first
                    </p>
                  </div>
                ) : null}

                <div className="p-8">
                  <div className="mb-6 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900">OpenRouter BYOK</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Enter your API key to enable AI capabilities.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StepIndicator status={byokStatus} />
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-semibold",
                          byokStatus === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : byokStatus === "failed"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-slate-200 bg-slate-100 text-slate-500"
                        )}
                      >
                        {byokStatus === "success"
                          ? "Verified"
                          : byokStatus === "failed"
                            ? "Failed"
                            : "Pending"}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full border border-slate-200 px-2 py-1 text-slate-700">
                      {hasConfiguredOpenRouterKey ? "BYOK configured" : "BYOK not configured"}
                    </span>
                    {isLoadingKeyStatus ? <span className="text-slate-500">Checking status...</span> : null}
                    {hasStoredOpenRouterKey && keyLast4 ? (
                      <span className="text-slate-500">Stored key ending in {keyLast4}</span>
                    ) : null}
                    {lastValidatedAt ? (
                      <span className="text-slate-500">
                        Last verified {new Date(lastValidatedAt).toLocaleString()}
                      </span>
                    ) : null}
                    {hasDevFallbackOpenRouterKey ? (
                      <span className="text-slate-500">Dev fallback key active</span>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="openrouter-key" className="text-sm font-medium text-slate-700">
                      OpenRouter API Key
                    </Label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="openrouter-key"
                        type="password"
                        placeholder="sk-or-v1-..."
                        value={keyInput}
                        onChange={(event) => setKeyInput(event.target.value)}
                        disabled={!user || isSavingByok || isRemovingByok}
                        className="h-11 border-slate-300 pl-10"
                      />
                    </div>
                  </div>

                  {byokStatus === "success" ? (
                    <p className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      OpenRouter API key verified.
                    </p>
                  ) : null}

                  {lastValidationStatus === "failed" || byokError ? (
                    <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                      <XCircle className="h-4 w-4" />
                      {byokError ?? lastValidationError ?? "OpenRouter API verification failed."}
                    </p>
                  ) : null}

                  {needsRevalidation && byokStatus !== "success" ? (
                    <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                      Verification refresh pending. Save again after refresh if needed.
                    </p>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      onClick={handleSaveByok}
                      disabled={!user || isSavingByok || isRemovingByok}
                      className="bg-blue-600 text-white hover:bg-blue-700"
                    >
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
                  </div>
                </div>
              </section>

              <Button
                type="button"
                onClick={() => navigate(continuePath)}
                disabled={!canContinue}
                className={cn(
                  "h-12 w-full rounded-xl text-base font-semibold uppercase tracking-wide",
                  canContinue
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-slate-200 text-slate-500 hover:bg-slate-200"
                )}
              >
                Continue
              </Button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
