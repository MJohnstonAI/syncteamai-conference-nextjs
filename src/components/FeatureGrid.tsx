import { Users, Zap, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Users,
    title: "Multi-Agent Collaboration",
    description: "Multiple AI agents work together to provide diverse perspectives and comprehensive solutions.",
  },
  {
    icon: Zap,
    title: "Instant Conference Setup",
    description: "Choose a template and launch a conference in seconds with pre-configured AI teams.",
  },
  {
    icon: Shield,
    title: "Reliable & Scalable",
    description: "Built on robust infrastructure to handle conferences of any size with consistent performance.",
  },
];

export const FeatureGrid = () => {
  return (
    <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
      {features.map((feature, index) => (
        <Card key={index} className="border-2 hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
              <feature.icon className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg">{feature.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>{feature.description}</CardDescription>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
