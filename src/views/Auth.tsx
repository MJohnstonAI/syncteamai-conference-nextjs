import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@/lib/router";
import { Sparkles, Loader2, Mail } from "lucide-react";
import { HomeIcon } from "@/components/HomeIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("action") === "subscribe" ? "/subscribe" : "/templates";
  }, [location.search]);

  useEffect(() => {
    const hashError = parseHashError();
    if (!hashError) return;

    toast({
      title: "Sign-in failed",
      description: hashError,
      variant: "destructive",
    });
  }, [toast]);

  useEffect(() => {
    if (!loading && user) {
      navigate(nextPath, { replace: true });
    }
  }, [loading, navigate, nextPath, user]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || isSending) return;

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
      toast({
        title: "Unable to send magic link",
        description: error instanceof Error ? error.message : "Unexpected authentication error.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed top-6 left-6 z-50">
        <HomeIcon />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="inline-flex w-fit self-center items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            SyncTeamAI
          </div>
          <CardTitle className="text-2xl">Sign in with magic link</CardTitle>
          <CardDescription>
            Enter your email and we will send a secure sign-in link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
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

            {linkSent && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                We sent your magic link. Open the email on this device to continue.
              </p>
            )}

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

            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/")}>
              Back to home
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

