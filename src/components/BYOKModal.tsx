import { useNavigate } from '@/lib/router';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, Key } from 'lucide-react';

interface BYOKModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
  source?: string;
  entry?: string;
}

/**
 * @deprecated This modal is retained only for compatibility.
 * Prefer direct navigation to /settings with explicit context.
 */
export function BYOKModal({
  open,
  onOpenChange,
  returnTo = '/conference',
  source = 'modal',
  entry = 'legacy',
}: BYOKModalProps) {
  const navigate = useNavigate();

  const openSettings = () => {
    const params = new URLSearchParams({
      source,
      focus: 'byok',
      entry,
      return_to: returnTo,
    });
    navigate(`/settings?${params.toString()}`);
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
            BYOK settings have moved to a dedicated Settings page for better management.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            BYOK is managed on Settings. Use the button below to continue with full context and then return.
          </p>
          
          <Button onClick={openSettings} className="w-full">
            <Settings className="h-4 w-4 mr-2" />
            Go to Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


