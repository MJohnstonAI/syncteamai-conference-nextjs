import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from '@/lib/router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useBYOK } from '@/hooks/useBYOK';
import { Loader2, Key, ArrowLeft, Trash2 } from 'lucide-react';
import { authedFetch } from '@/lib/auth-token';

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
  const { toast } = useToast();
  const {
    openRouterKey,
    setOpenRouterKey,
    clearOpenRouterKey,
    setStoreKeyPreference,
    storeKey,
    hasStoredOpenRouterKey,
    hasDevFallbackOpenRouterKey,
    hasConfiguredOpenRouterKey,
    keyLast4,
    isLoadingKeyStatus,
    setStoredKeyStatus,
    refreshStoredKeyStatus,
    resetAvatarOrder,
  } = useBYOK();

  const [keyInput, setKeyInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [usageItems, setUsageItems] = useState<UsageItem[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [highlightByokCard, setHighlightByokCard] = useState(false);
  const byokCardRef = useRef<HTMLDivElement | null>(null);

  const source = searchParams.get('source');
  const entry = searchParams.get('entry');
  const focus = searchParams.get('focus');
  const returnTo = searchParams.get('return_to');
  const conferenceReturnPath = useMemo(() => {
    if (returnTo && returnTo.startsWith('/conference')) {
      return returnTo;
    }
    return '/conference';
  }, [returnTo]);

  const maskedSessionKey = openRouterKey
    ? `session key ending in ${openRouterKey.slice(-4)}`
    : null;

  const loadUsage = useCallback(async () => {
    setIsLoadingUsage(true);
    try {
      const response = await authedFetch('/api/settings/usage', {
        method: 'GET',
      });
      if (!response.ok) {
        throw new Error('Unable to load usage events');
      }
      const payload = (await response.json()) as UsagePayload;
      setUsageItems(payload.items ?? []);
    } catch {
      setUsageItems([]);
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  useEffect(() => {
    if (focus !== 'byok') return;
    byokCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlightByokCard(true);
    const timer = window.setTimeout(() => setHighlightByokCard(false), 1800);
    return () => window.clearTimeout(timer);
  }, [focus]);

  const handleSave = async () => {
    const trimmed = keyInput.trim();
    const needsKey =
      !trimmed && (!hasConfiguredOpenRouterKey || (!storeKey && !hasStoredOpenRouterKey));

    if (needsKey) {
      toast({
        title: 'API Key Required',
        description: 'Paste a key or keep stored key enabled before saving.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await authedFetch('/api/settings/byok', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'openrouter',
          key: trimmed || undefined,
          storeKey,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        hasStoredKey?: boolean;
        keyLast4?: string | null;
        storeKey?: boolean;
        hasDevFallbackKey?: boolean;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save BYOK settings');
      }

      setStoredKeyStatus({
        hasStoredKey: Boolean(payload.hasStoredKey),
        keyLast4: payload.keyLast4 ?? null,
        storeKey: Boolean(payload.storeKey),
        hasDevFallbackKey: payload.hasDevFallbackKey,
      });

      if (storeKey) {
        clearOpenRouterKey();
      } else if (trimmed) {
        setOpenRouterKey(trimmed, false);
      }

      setKeyInput('');
      toast({
        title: 'Saved',
        description: storeKey
          ? 'Key stored securely on your account.'
          : 'Session-only key active. Stored key data was scrubbed.',
      });
      await refreshStoredKeyStatus();
      await loadUsage();
    } catch (error) {
      toast({
        title: 'Save Failed',
        description:
          error instanceof Error ? error.message : 'Unable to update key settings.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const response = await authedFetch('/api/settings/byok', {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to remove key');
      }
      clearOpenRouterKey();
      setStoredKeyStatus({
        hasStoredKey: false,
        keyLast4: null,
        storeKey: false,
      });
      setKeyInput('');
      toast({
        title: 'Key Removed',
        description: 'Stored and session key material has been cleared.',
      });
      await refreshStoredKeyStatus();
      await loadUsage();
    } catch (error) {
      toast({
        title: 'Remove Failed',
        description: error instanceof Error ? error.message : 'Unable to remove key',
        variant: 'destructive',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
        <Button variant="ghost" onClick={() => navigate(conferenceReturnPath)} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Conference
        </Button>

        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your AI connections and preferences</p>
        </div>

        {source === 'conference' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Opened from Conference</Badge>
            {entry ? <Badge variant="outline">Entry: {entry}</Badge> : null}
          </div>
        ) : null}

        <Card
          ref={byokCardRef}
          className={highlightByokCard ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary))]' : undefined}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" /> Open Router API Key
            </CardTitle>
            <CardDescription>
              Connect your Open Router account to access 30+ AI models with a single key. Get your key at{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                openrouter.ai/keys
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={hasConfiguredOpenRouterKey ? 'secondary' : 'outline'}>
                {hasConfiguredOpenRouterKey ? 'Configured' : 'Not configured'}
              </Badge>
              {isLoadingKeyStatus && (
                <span className="text-sm text-muted-foreground">Refreshing status...</span>
              )}
              {hasStoredOpenRouterKey && keyLast4 && (
                <span className="text-sm text-muted-foreground">
                  Stored key ending in {keyLast4}
                </span>
              )}
              {maskedSessionKey && (
                <span className="text-sm text-muted-foreground">{maskedSessionKey}</span>
              )}
              {hasDevFallbackOpenRouterKey && (
                <span className="text-sm text-muted-foreground">
                  Dev env fallback key is active
                </span>
              )}
            </div>

            <div>
              <Label htmlFor="openrouter-key">API Key</Label>
              <Input
                id="openrouter-key"
                type="password"
                placeholder="sk-or-v1-..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                disabled={isSaving || isRemoving}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="store-key"
                checked={storeKey}
                onCheckedChange={setStoreKeyPreference}
                disabled={isSaving || isRemoving}
              />
              <Label htmlFor="store-key" className="cursor-pointer">
                Store encrypted key on account
              </Label>
            </div>
            {!storeKey && (
              <p className="text-xs text-muted-foreground">
                Session-only mode: key is kept in memory only and scrubbed from DB.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={isSaving || isRemoving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemove}
                disabled={isSaving || isRemoving}
              >
                {isRemoving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" /> Remove Key
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avatar Order</CardTitle>
            <CardDescription>Reset the roundtable response order to default (alphabetical)</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={resetAvatarOrder}>Reset to Default Order</Button>
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Refreshing
                </>
              ) : (
                'Refresh'
              )}
            </Button>
            {usageItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage events yet.</p>
            ) : (
              <div className="space-y-2">
                {usageItems.slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded border px-3 py-2 text-sm">
                    <div className="font-medium">{item.model_id}</div>
                    <div className="text-muted-foreground">
                      {item.status.toUpperCase()} - {item.total_tokens ?? 0} tokens -{' '}
                      {item.cost_cents != null ? `${item.cost_cents} cents` : 'cost n/a'} -{' '}
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
