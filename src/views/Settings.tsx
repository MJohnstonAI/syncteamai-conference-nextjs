import { useState } from 'react';
import { useNavigate } from '@/lib/router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useBYOK } from '@/hooks/useBYOK';
import { Loader2, Key, ArrowLeft, Trash2 } from 'lucide-react';

export default function Settings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openRouterKey, setOpenRouterKey, clearOpenRouterKey, resetAvatarOrder } = useBYOK();

  const [keyInput, setKeyInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [shouldStore, setShouldStore] = useState(true);

  const maskedKey = openRouterKey
    ? `${openRouterKey.slice(0, 7)}${'\u2022'.repeat(Math.max(1, openRouterKey.length - 11))}${openRouterKey.slice(-4)}`
    : '';

  const handleValidate = async () => {
    if (!keyInput.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter an API key', variant: 'destructive' });
      return;
    }
    setIsValidating(true);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${keyInput}` },
      });
      if (!response.ok) throw new Error('Invalid API key');
      setOpenRouterKey(keyInput, shouldStore);
      setKeyInput('');
      toast({ title: 'Success', description: 'Open Router API key validated and saved' });
    } catch (error) {
      toast({ title: 'Validation Failed', description: error instanceof Error ? error.message : 'Invalid API key', variant: 'destructive' });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRevoke = () => {
    clearOpenRouterKey();
    setKeyInput('');
    toast({ title: 'API Key Revoked', description: 'Your Open Router key has been removed' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4 space-y-6">
        <Button variant="ghost" onClick={() => navigate('/conference')} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Conference
        </Button>

        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Manage your AI connections and preferences</p>
        </div>

        <Card>
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
            {openRouterKey ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-green-500" />
                    <span className="font-mono text-sm">{maskedKey}</span>
                  </div>
                  <Button variant="destructive" size="sm" onClick={handleRevoke}>
                    <Trash2 className="h-4 w-4 mr-2" /> Revoke
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">✓ Connected • Models available in Conference page dropdown</div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="openrouter-key">API Key</Label>
                  <Input id="openrouter-key" type="password" placeholder="sk-or-v1-..." value={keyInput} onChange={(e) => setKeyInput(e.target.value)} disabled={isValidating} />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="store-key" checked={shouldStore} onCheckedChange={setShouldStore} />
                  <Label htmlFor="store-key" className="cursor-pointer">
                    Store key securely (recommended)
                  </Label>
                </div>
                {!shouldStore && <p className="text-xs text-muted-foreground">Key will only be stored in your browser session. You'll need to re-enter it after logging out.</p>}
                <Button onClick={handleValidate} disabled={isValidating || !keyInput.trim()}>
                  {isValidating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validating...
                    </>
                  ) : (
                    'Validate & Save'
                  )}
                </Button>
              </div>
            )}
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
      </div>
    </div>
  );
}



