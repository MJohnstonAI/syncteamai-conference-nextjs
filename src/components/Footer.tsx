import { Link } from "@/lib/router";

export const Footer = () => {
  return (
    <footer className="relative border-t py-6 bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm">
          <nav className="flex gap-4 text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <span className="text-muted-foreground/50">|</span>
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
          </nav>
          <p className="text-muted-foreground text-center">
            © 2025 NeuroSync AI Dynamics (Pty) Ltd. All Rights Reserved | Version 1.4
          </p>
          <nav className="text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

