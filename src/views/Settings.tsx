import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBYOK } from "@/hooks/useBYOK";
import { Loader2, ArrowLeft, KeyRound, LogIn } from "lucide-react";
import { authedFetch } from "@/lib/auth-token";

type UsageItem = {
  id: string;
  model_id: string;
  status: string;
  total_tokens: number | null;
  cost_cents: number | null;
  latency_ms: number | null;
  created_at: string;
};

type UsagePayload = {
  items?: UsageItem[];
};

export default function Settings() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
    resetAvatarOrder,
  } = useBYOK();

  const [usageItems, setUsageItems] = useState<UsageItem[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  const source = searchParams.get("source");
  const entry = searchParams.get("entry");
  const returnTo = searchParams.get("return_to");
  const conferenceReturnPath = useMemo(() => {
    if (returnTo && returnTo.startsWith("/conference")) {
      return returnTo;
    }
    return "/conference";
  }, [returnTo]);

  const byokManagePath = useMemo(() => {
    const params = new URLSearchParams({ step: "2" });
    if (conferenceReturnPath.startsWith("/conference")) {
      params.set("return_to", conferenceReturnPath);
    }
    return `/auth?${params.toString()}`;
  }, [conferenceReturnPath]);

  const loadUsage = useCallback(async () => {
    setIsLoadingUsage(true);
    setUsageError(null);
    try {
      const response = await authedFetch("/api/settings/usage", {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error("Unable to load usage events");
      }
      const payload = (await response.json()) as UsagePayload;
      setUsageItems(payload.items ?? []);
    } catch (error) {
      setUsageItems([]);
      setUsageError(error instanceof Error ? error.message : "Unable to load usage events.");
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
        <Button variant="ghost" onClick={() => navigate(conferenceReturnPath)} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Conference
        </Button>

        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Read-only configuration and usage overview</p>
        </div>

        {source === "conference" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Opened from Conference</Badge>
            {entry ? <Badge variant="outline">Entry: {entry}</Badge> : null}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              OpenRouter BYOK
            </CardTitle>
            <CardDescription>
              BYOK editing has moved to Sign-in. Settings now shows read-only status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={hasConfiguredOpenRouterKey ? "secondary" : "outline"}>
                {hasConfiguredOpenRouterKey ? "Configured" : "Not configured"}
              </Badge>
              {isLoadingKeyStatus ? (
                <span className="text-sm text-muted-foreground">Refreshing status...</span>
              ) : null}
              {hasStoredOpenRouterKey && keyLast4 ? (
                <span className="text-sm text-muted-foreground">Stored key ending in {keyLast4}</span>
              ) : null}
              {lastValidatedAt ? (
                <span className="text-sm text-muted-foreground">
                  Last verified {new Date(lastValidatedAt).toLocaleString()}
                </span>
              ) : null}
              {lastValidationStatus === "failed" ? (
                <span className="text-sm text-red-600">
                  Verification failed{lastValidationError ? `: ${lastValidationError}` : "."}
                </span>
              ) : null}
              {needsRevalidation ? (
                <span className="text-sm text-muted-foreground">Verification refresh pending</span>
              ) : null}
              {hasDevFallbackOpenRouterKey ? (
                <span className="text-sm text-muted-foreground">Dev env fallback key is active</span>
              ) : null}
            </div>

            <Button variant="outline" onClick={() => navigate(byokManagePath)}>
              <LogIn className="mr-2 h-4 w-4" />
              Manage BYOK in Sign-in
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avatar Order</CardTitle>
            <CardDescription>
              Reset the roundtable response order to default (alphabetical)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={resetAvatarOrder}>
              Reset to Default Order
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Usage</CardTitle>
            <CardDescription>Latest OpenRouter usage events recorded on the server</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" onClick={loadUsage} disabled={isLoadingUsage}>
              {isLoadingUsage ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing
                </>
              ) : (
                "Refresh"
              )}
            </Button>

            {usageError ? (
              <p className="text-sm text-muted-foreground">{usageError}</p>
            ) : null}

            {usageItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage events yet.</p>
            ) : (
              <div className="space-y-2">
                {usageItems.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded border px-3 py-2 text-sm">
                    <div className="font-medium">{item.model_id}</div>
                    <div className="text-muted-foreground">
                      {item.status.toUpperCase()} - {item.total_tokens ?? 0} tokens -{" "}
                      {item.cost_cents != null ? `${item.cost_cents} cents` : "cost n/a"} -{" "}
                      {item.latency_ms ?? 0} ms
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
