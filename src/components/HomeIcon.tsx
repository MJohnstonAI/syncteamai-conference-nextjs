import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const HomeIcon = () => {
  return (
    <Button
      variant="ghost"
      size="icon"
      asChild
      className="group relative h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 hover:from-primary/30 hover:to-primary/10 transition-all duration-300 hover:scale-110 hover:shadow-lg hover:shadow-primary/20"
    >
      <Link href="/" aria-label="Go home">
        <Home className="h-6 w-6 text-primary group-hover:text-primary transition-colors" />
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />
      </Link>
    </Button>
  );
};

