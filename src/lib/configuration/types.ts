export type ConfigurationMode = "quick-start" | "custom";

export type StakesLevel = "low" | "medium" | "high" | "critical" | "unspecified";
export type TimelineLevel = "urgent" | "near-term" | "quarterly" | "long-term" | "unspecified";
export type BudgetLevel = "lean" | "balanced" | "premium" | "unspecified";
export type CompanySize = "startup" | "small" | "mid-market" | "enterprise" | "unspecified";

export type BehaviorArchetype =
  | "analytical"
  | "strategic"
  | "adversarial"
  | "integrative"
  | "creative";

export type ResponseLength = "concise" | "medium" | "comprehensive";
export type ExpertPriority = "critical" | "recommended" | "optional";
export type AnalysisSource = "ai" | "heuristic";

export type TemplateData = {
  id: string;
  title: string;
  description: string | null;
  script: string;
  problemStatement: string;
  type: string;
  context: {
    companySize: CompanySize;
    stakesLevel: StakesLevel;
    timeline: TimelineLevel;
    budget: BudgetLevel;
  };
  createdAt: string;
};

export type ExpertRole = {
  id: string;
  title: string;
  category: string;
  icon: string;
  description: string;
  focusAreas: string[];
  behavior: {
    archetype: BehaviorArchetype;
    temperature: number;
    responseLength: ResponseLength;
    interactionStyle: string[];
  };
  model: {
    provider: string;
    modelId: string;
    displayName: string;
  };
  whyIncluded: string;
  priority: ExpertPriority;
};

export type ChallengeAnalysis = {
  problemType: string;
  complexityScore: number;
  complexityReason: string;
  recommendedStrategy: string;
  strategyReason: string;
  keyConsiderations: string[];
  expertPanel: ExpertRole[];
  estimatedDuration: number;
  estimatedCost: {
    min: number;
    max: number;
  };
  analysisSource?: AnalysisSource;
};

