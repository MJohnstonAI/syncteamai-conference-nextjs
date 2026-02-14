import { useNavigate } from '@/lib/router';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Key, LogIn } from 'lucide-react';

interface BYOKModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
  source?: string;
  entry?: string;
}

/**
 * @deprecated This modal is retained only for compatibility.
 * Prefer direct navigation to /auth with explicit context.
 */
export function BYOKModal({
  open,
  onOpenChange,
  returnTo = '/conference',
  source = 'modal',
  entry = 'legacy',
}: BYOKModalProps) {
  const navigate = useNavigate();

  const openSignIn = () => {
    const params = new URLSearchParams({
      step: '2',
      source,
      entry,
      return_to: returnTo,
    });
    navigate(`/auth?${params.toString()}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Bring Your Own Key (BYOK)
          </DialogTitle>
          <DialogDescription>
            BYOK setup has moved to the Sign-in page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use the button below to open step (2) OpenRouter BYOK and then return.
          </p>
          
          <Button onClick={openSignIn} className="w-full">
            <LogIn className="h-4 w-4 mr-2" />
            Open Sign-in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


