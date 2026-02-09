import { Footer } from "@/components/Footer";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const Privacy = () => {
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
        <h1 className="text-4xl font-bold mb-4">Privacy Notice</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: September 19, 2025</p>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p className="text-muted-foreground leading-relaxed">
            Welcome to SyncTeamAI. We are committed to protecting your privacy and handling your data in an open and transparent manner. This privacy notice explains how we collect, use, share, and protect your personal information when you use our services.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We collect information to provide and improve our services. This includes:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed ml-4">
            <li><strong>Account Information:</strong> When you sign up, we collect your authentication data through Supabase (magic link email sign-in), including your user ID and email address.</li>
            <li><strong>User-Generated Content:</strong> We store the prompt scripts, groups, and other content you create in your private library ("SavedPrompts"). For admin-created "Demo" prompts, this content is made publicly available.</li>
            <li><strong>Subscription Data:</strong> If you subscribe to a paid plan, your role is stored in your user metadata to manage access to features. We do not store your payment card details.</li>
            <li><strong>API Keys (BYOK):</strong> For paid users who "Bring Your Own Key," we store references to your API keys for third-party AI models. These keys are encrypted in transit and at rest.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
          <p className="text-muted-foreground leading-relaxed mb-3">
            Your information is used to:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed ml-4">
            <li>Provide, operate, and maintain our services.</li>
            <li>Authenticate you and manage your account.</li>
            <li>Process your requests and send you related information.</li>
            <li>Improve and personalize our services based on your usage.</li>
            <li>Communicate with you about updates, security alerts, and support messages.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Data Sharing and Disclosure</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We do not sell your personal information. We may share your information in the following limited circumstances:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed ml-4">
            <li><strong>With AI Service Providers:</strong> When you run a prompt, the content of that prompt is sent to the selected third-party AI model (e.g., Google, OpenAI) to generate a response. Their use of your data is governed by their respective privacy policies.</li>
            <li><strong>For Legal Reasons:</strong> We may disclose your information if required by law or in response to valid requests by public authorities.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
          <p className="text-muted-foreground leading-relaxed">
            We implement a variety of security measures to maintain the safety of your personal information. Authentication is handled through Supabase Auth with secure magic-link sign in. We use encryption for sensitive data and follow industry best practices to protect your data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            You have the right to access, update, or delete your personal information. You can manage your prompt scripts and groups directly within your account. For account deletion or other inquiries, please contact us.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">7. Contact Us</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions about this Privacy Notice, please contact us at <a href="mailto:SyncTeamAI@gmail.com" className="text-primary hover:underline">SyncTeamAI@gmail.com</a>
          </p>
        </section>


      </div>

      <Footer />
    </div>
  );
};

export default Privacy;

