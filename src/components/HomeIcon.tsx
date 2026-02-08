import { useNavigate } from "@/lib/router";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export const HomeIcon = () => {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/")}
      className="group relative h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 hover:from-primary/30 hover:to-primary/10 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-primary/20"
    >
      <Home className="h-6 w-6 text-primary group-hover:text-primary transition-colors" />
      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />
    </Button>
  );
};

