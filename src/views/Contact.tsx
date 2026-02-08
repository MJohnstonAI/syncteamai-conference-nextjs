import { Footer } from "@/components/Footer";
import { HomeIcon } from "@/components/HomeIcon";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Home Icon */}
      <div className="fixed top-6 left-6 z-50">
        <HomeIcon />
      </div>
      <div className="container mx-auto px-4 py-16 flex-1 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Contact Us</h1>
        
        <section className="mb-8">
          <p className="text-muted-foreground leading-relaxed mb-6">
            We'd love to hear from you! Whether you have questions, feedback, or need support, feel free to reach out to us.
          </p>
          
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Get in Touch</h2>
            <p className="text-muted-foreground mb-4">
              Email us at: <a href="mailto:SyncTeamAI@gmail.com" className="text-primary hover:underline font-medium">SyncTeamAI@gmail.com</a>
            </p>
            <p className="text-muted-foreground">
              We typically respond within 24-48 hours during business days.
            </p>
          </div>
        </section>

        <p className="text-sm text-muted-foreground text-center border-t pt-6 mt-12">
          © 2025 NeuroSync AI Dynamics (Pty) Ltd. All Rights Reserved | Version 1.4
        </p>
      </div>

      <Footer />
    </div>
  );
};

export default Contact;
