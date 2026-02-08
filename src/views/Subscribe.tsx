import { HomeIcon } from "@/components/HomeIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

const Subscribe = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Home Icon */}
      <div className="fixed top-6 left-6 z-50">
        <HomeIcon />
      </div>

      <div className="container mx-auto px-6 py-16 max-w-3xl">
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="text-center space-y-4 pb-8">
            <div className="inline-block mx-auto px-6 py-3 rounded-full bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/20">
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Professional Plan
              </CardTitle>
              <p className="text-2xl font-semibold text-foreground mt-2">$20/month</p>
            </div>
          </CardHeader>

          <CardContent className="space-y-8">
            {/* PayPal Form Container */}
            <div className="bg-muted/30 rounded-lg border-2 border-dashed border-primary/20 p-8 min-h-[400px] flex items-center justify-center">
              <div className="text-center space-y-4">
                <p className="text-muted-foreground text-sm font-mono">
                  {/* ============================================
                      INSERT YOUR PAYPAL EMBEDDED FORM HERE
                      
                      Replace this entire comment block with your
                      PayPal subscription button code
                      
                      Required fields in your PayPal form:
                      - return URL: /templates?subscribed=true
                      - cancel_return URL: /templates
                      - amount: $20/month
                      ============================================ */}
                  PayPal form will be inserted here during export
                </p>
              </div>
            </div>

            {/* Benefits Section */}
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-center">What You'll Get:</h3>
              
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">All 8 AI Agents</span>
                    <p className="text-sm text-muted-foreground">ChatGPT, Claude, Gemini, Grok, Llama, Qwen, Mistral, Gemma</p>
                  </div>
                </li>
                
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">500 Cloud AI Messages per Month</span>
                    <p className="text-sm text-muted-foreground"></p>
                  </div>
                </li>
                
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Unlimited Conferences</span>
                    <p className="text-sm text-muted-foreground">Create and save as many as you need</p>
                  </div>
                </li>
                
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Custom Templates</span>
                    <p className="text-sm text-muted-foreground">Build your own agent team templates</p>
                  </div>
                </li>
                
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Export Conversations</span>
                    <p className="text-sm text-muted-foreground">Download transcripts as PDF or text</p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Footer Note */}
            <div className="text-center pt-6 border-t">
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                <span className="text-xl">💎</span>
                Loyal subscribers who stay for 3+ months may receive a discount. We're building that feature with revenue from your subscription!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Subscribe;
