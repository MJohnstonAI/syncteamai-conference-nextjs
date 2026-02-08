import { useEffect } from 'react';
import { useNavigate } from '@/lib/router';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, Key } from 'lucide-react';

interface BYOKModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * @deprecated This modal is deprecated in favor of the Settings page.
 * It now redirects users to /settings for multi-provider BYOK management.
 */
export function BYOKModal({ open, onOpenChange }: BYOKModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      // Auto-redirect to settings when modal would open
      navigate('/settings');
      onOpenChange(false);
    }
  }, [open, navigate, onOpenChange]);

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
            You can now manage API keys for multiple providers (OpenAI, Anthropic, Google, xAI) from the Settings page.
          </p>
          
          <Button onClick={() => navigate('/settings')} className="w-full">
            <Settings className="h-4 w-4 mr-2" />
            Go to Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


