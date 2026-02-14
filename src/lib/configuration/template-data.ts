import type {
  BudgetLevel,
  CompanySize,
  StakesLevel,
  TemplateData,
  TimelineLevel,
} from "@/lib/configuration/types";

type PromptRow = {
  id: string;
  title: string;
  description: string | null;
  script: string;
  created_at: string;
};

const compact = (value: string): string => value.toLowerCase().trim();

const containsAny = (value: string, checks: string[]) =>
  checks.some((check) => value.includes(check));

const inferProblemType = (source: string): string => {
  const text = compact(source);
  if (containsAny(text, ["microservice", "architecture", "system design", "scalability", "platform"])) {
    return "technical_architecture";
  }
  if (containsAny(text, ["go-to-market", "positioning", "pricing strategy", "product strategy"])) {
    return "product_strategy";
  }
  if (containsAny(text, ["risk", "compliance", "security", "incident", "audit"])) {
    return "risk_assessment";
  }
  if (containsAny(text, ["research", "synthesis", "evidence", "literature", "analysis"])) {
    return "research_synthesis";
  }
  if (containsAny(text, ["roadmap", "portfolio", "resource planning", "prioritization"])) {
    return "planning";
  }
  return "general_strategy";
};

const inferStakesLevel = (source: string): StakesLevel => {
  const text = compact(source);
  if (containsAny(text, ["existential", "irreversible", "regulatory", "security breach", "critical"])) {
    return "critical";
  }
  if (containsAny(text, ["high stakes", "major impact", "executive", "board", "migration"])) {
    return "high";
  }
  if (containsAny(text, ["important", "customer impact", "cross-team"])) {
    return "medium";
  }
  if (containsAny(text, ["exploratory", "brainstorm", "lightweight"])) {
    return "low";
  }
  return "unspecified";
};

const inferTimeline = (source: string): TimelineLevel => {
  const text = compact(source);
  if (containsAny(text, ["asap", "immediately", "urgent", "this week", "24h", "48h"])) {
    return "urgent";
  }
  if (containsAny(text, ["next sprint", "this month", "30 days", "six weeks"])) {
    return "near-term";
  }
  if (containsAny(text, ["this quarter", "q1", "q2", "q3", "q4", "90 days"])) {
    return "quarterly";
  }
  if (containsAny(text, ["long-term", "next year", "12 months", "multi-year"])) {
    return "long-term";
  }
  return "unspecified";
};

const inferBudget = (source: string): BudgetLevel => {
  const text = compact(source);
  if (containsAny(text, ["tight budget", "cost-sensitive", "budget constraint", "lean"])) {
    return "lean";
  }
  if (containsAny(text, ["strategic investment", "large budget", "premium resources"])) {
    return "premium";
  }
  if (containsAny(text, ["budget", "cost", "roi", "runway"])) {
    return "balanced";
  }
  return "unspecified";
};

const inferCompanySize = (source: string): CompanySize => {
  const text = compact(source);
  if (containsAny(text, ["enterprise", "fortune", "global", "multi-region"])) {
    return "enterprise";
  }
  if (containsAny(text, ["mid-market", "scale-up"])) {
    return "mid-market";
  }
  if (containsAny(text, ["small business", "smb"])) {
    return "small";
  }
  if (containsAny(text, ["startup", "founder"])) {
    return "startup";
  }
  return "unspecified";
};

export const buildTemplateDataFromPrompt = (prompt: PromptRow): TemplateData => {
  const source = [prompt.title, prompt.description ?? "", prompt.script].join(" ");
  return {
    id: prompt.id,
    title: prompt.title,
    description: prompt.description,
    script: prompt.script,
    // Product requirement: problem statement now comes from selected template title.
    problemStatement: prompt.title,
    type: inferProblemType(source),
    context: {
      companySize: inferCompanySize(source),
      stakesLevel: inferStakesLevel(source),
      timeline: inferTimeline(source),
      budget: inferBudget(source),
    },
    createdAt: prompt.created_at,
  };
};

