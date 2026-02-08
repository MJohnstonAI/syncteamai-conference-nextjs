import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { useNavigate } from "@/lib/router";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section with Background */}
      <section className="relative min-h-screen flex items-center flex-1">
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/images/neural-network-bg.webp')" }}
        />
        {/* Dark Overlay for readability */}
        <div className="absolute inset-0 bg-black/40" />
        
        {/* Logo */}
        <div className="absolute top-8 left-8">
          <h2 className="text-2xl font-bold text-white">SyncTeam<span className="text-primary">AI</span></h2>
        </div>
        
        {/* Content */}
        <div className="relative container mx-auto px-4 py-24">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight text-white">
              Assemble Your Dream Team of AI Minds<br />—Working Together for You
            </h1>
            
            <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
              Act as the Creative Director and guide multiple AI models collaborating in real-time on a single canvas. Your vision, orchestrated.
            </p>

            <Button 
              size="lg" 
              onClick={() => navigate("/templates")} 
              className="text-lg px-8 bg-primary hover:bg-primary/90 focus-visible:ring-primary/50"
            >
              Start Building Your AI Council
            </Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;

