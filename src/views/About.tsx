import { Footer } from "@/components/Footer";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const About = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Home Navigation */}
      <div className="absolute top-8 left-8">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="text-foreground hover:text-primary"
        >
          <Link href="/" aria-label="Go home">
            <Home className="h-6 w-6" />
          </Link>
        </Button>
      </div>

      <div className="container mx-auto px-4 py-16 flex-1 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">About SyncTeamAI</h1>

        <section className="mb-8">
          <h2 className="text-3xl font-bold mb-4 text-primary">Orchestrating Collective Intelligence</h2>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
          <p className="text-muted-foreground leading-relaxed">
            Our mission at SyncTeamAI is to transform how humans collaborate with artificial intelligence. We believe
            that the future of problem-solving lies not with a single AI, but with a diverse council of specialized AI
            agents working in concert, guided by human intuition and direction.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">What is SyncTeamAI?</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            SyncTeamAI is a collaborative platform where you act as the "Creative Director" for a team of AI agents.
            Instead of a simple chat, you run structured working sessions. Our platform facilitates a process of debate,
            evidence-gathering, and synthesis, allowing different AI perspectives—like a Skeptic, an Innovator, and a
            Data Analyst—to challenge and build upon each other's ideas.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The result is a more robust, well-reasoned, and actionable output than any single AI could produce on its
            own.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">How It Works</h2>
          <ol className="list-decimal list-inside space-y-3 text-muted-foreground leading-relaxed">
            <li>
              <strong>Assemble Your Council:</strong> Choose from a variety of AI models and assign them specific roles,
              from Devil's Advocate to Strategic Thinker.
            </li>
            <li>
              <strong>Direct the Session:</strong> Provide your core objective and constraints, then guide the AI team
              as they discuss, debate, and refine their approach.
            </li>
            <li>
              <strong>Receive Actionable Insights:</strong> The final output is not just an answer, but a synthesized
              brief that includes the decision, the rationale behind it, and the key points of the debate.
            </li>
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Our Vision</h2>
          <p className="text-muted-foreground leading-relaxed">
            We are building a future where human creativity is amplified by collective AI intelligence. SyncTeamAI is
            more than a tool; it's a new paradigm for structured thinking and complex problem-solving.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  );
};

export default About;

