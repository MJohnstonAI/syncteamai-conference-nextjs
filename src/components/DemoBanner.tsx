import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router";

export const DemoBanner = () => {
  const navigate = useNavigate();
  
  return (
    <Alert className="mb-6 border-primary/20 bg-primary/5">
      <AlertCircle className="h-4 w-4 text-primary" />
      <AlertDescription className="flex items-center justify-between text-sm gap-4">
        <span>
          You're in demo mode. <strong>Sign in</strong> to save or edit templates, access 9 AI agents, all features unlocked, export conversations.
        </span>
        <div className="flex gap-2 shrink-0">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => navigate("/auth")}
          >
            Sign In
          </Button>
          <Button 
            size="sm" 
            onClick={() => navigate("/subscribe")}
          >
            Subscribe $20/mo
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};

