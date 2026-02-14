import "server-only";

import { z } from "zod";
import { getModelById } from "@/data/openRouterModels";
import { estimateConferenceCost, resolveEstimatedCost } from "@/lib/configuration/cost";
import type {
  ChallengeAnalysis,
  ExpertRole,
  TemplateData,
} from "@/lib/configuration/types";
import { callOpenRouter } from "@/lib/server/openrouter";

const PRIMARY_ANALYZER_MODEL_ID = "google/gemini-2.5-flash";
const FALLBACK_ANALYZER_MODEL_ID = "google/gemini-2.5-pro";

const behaviorSchema = z.object({
  archetype: z.enum(["analytical", "strategic", "adversarial", "integrative", "creative"]),
  temperature: z.number().min(0).max(1),
  responseLength: z.enum(["concise", "medium", "comprehensive"]),
  interactionStyle: z.array(z.string()).min(1).max(6),
});

const expertRoleSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  category: z.string().min(1).max(120),
  icon: z.string().min(1).max(120),
  description: z.string().min(1).max(400),
  focusAreas: z.array(z.string()).min(1).max(8),
  behavior: behaviorSchema,
  model: z.object({
    provider: z.string().min(1).max(80),
    modelId: z.string().min(3).max(160),
    displayName: z.string().min(1).max(120),
  }),
  whyIncluded: z.string().min(1).max(800),
  priority: z.enum(["critical", "recommended", "optional"]),
});

const analysisSchema = z.object({
  problemType: z.string().min(1).max(100),
  complexityScore: z.number().min(1).max(10),
  complexityReason: z.string().min(1).max(1200),
  recommendedStrategy: z.string().min(1).max(100),
  strategyReason: z.string().min(1).max(1200),
  keyConsiderations: z.array(z.string()).min(2).max(12),
  expertPanel: z.array(expertRoleSchema).min(3).max(9),
  estimatedDuration: z.number().min(10).max(180),
  estimatedCost: z.object({
    min: z.number().min(0),
    max: z.number().min(0),
  }),
});

const preferredModelForArchetype: Record<ExpertRole["behavior"]["archetype"], string> = {
  analytical: "google/gemini-2.5-pro",
  strategic: "anthropic/claude-sonnet-4",
  adversarial: "anthropic/claude-haiku-3.5",
  integrative: "google/gemini-2.5-flash",
  creative: "anthropic/claude-sonnet-4.5",
};

const modelCandidatesForArchetype: Record<
  ExpertRole["behavior"]["archetype"],
  string[]
> = {
  analytical: [
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "anthropic/claude-haiku-3.5",
    "meta/llama-3.3-70b-instruct",
    "openai/gpt-4o-mini",
  ],
  strategic: [
    "anthropic/claude-sonnet-4",
    "anthropic/claude-sonnet-4.5",
    "google/gemini-2.5-pro",
    "openai/gpt-4o-mini",
    "meta/llama-3.3-70b-instruct",
  ],
  adversarial: [
    "anthropic/claude-haiku-3.5",
    "google/gemini-2.5-flash",
    "meta/llama-3.3-70b-instruct",
    "openai/gpt-4o-mini",
  ],
  integrative: [
    "google/gemini-2.5-flash",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-haiku-3.5",
    "openai/gpt-4o-mini",
    "meta/llama-3.3-70b-instruct",
  ],
  creative: [
    "anthropic/claude-sonnet-4.5",
    "google/gemini-2.5-pro",
    "anthropic/claude-haiku-3.5",
    "openai/gpt-4o-mini",
    "meta/llama-3.3-70b-instruct",
  ],
};

const MIN_ROLES_FOR_RUNNABLE_PANEL = 3;
const MAX_ALLOWED_MODELS_IN_PROMPT = 80;
const roleOverridePattern = /\*\*\*([^*]{1,120}?)\*\*\*/g;

const overrideBehaviorConfig: Record<
  ExpertRole["behavior"]["archetype"],
  {
    temperature: number;
    responseLength: ExpertRole["behavior"]["responseLength"];
    interactionStyle: string[];
    focusAreas: string[];
  }
> = {
  analytical: {
    temperature: 0.35,
    responseLength: "medium",
    interactionStyle: ["uses evidence", "clarifies assumptions", "tests consistency"],
    focusAreas: ["evidence quality", "assumption checks", "logical consistency"],
  },
  strategic: {
    temperature: 0.5,
    responseLength: "comprehensive",
    interactionStyle: ["aligns to outcomes", "prioritizes trade-offs", "keeps decision focus"],
    focusAreas: ["strategy alignment", "trade-off framing", "decision quality"],
  },
  adversarial: {
    temperature: 0.45,
    responseLength: "medium",
    interactionStyle: ["challenges weak claims", "surfaces risks", "forces mitigations"],
    focusAreas: ["counterarguments", "risk exposure", "failure modes"],
  },
  integrative: {
    temperature: 0.5,
    responseLength: "medium",
    interactionStyle: ["connects perspectives", "resolves conflicts", "summarizes consensus"],
    focusAreas: ["synthesis", "consensus points", "decision convergence"],
  },
  creative: {
    temperature: 0.75,
    responseLength: "medium",
    interactionStyle: ["proposes alternatives", "reframes constraints", "explores upside"],
    focusAreas: ["novel options", "scenario exploration", "differentiation"],
  },
};

const toRoleKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const toRoleSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

const toTitleCase = (value: string): string =>
  value
    .replace(/[^a-z0-9\s-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");

const sanitizeOverrideLabel = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .trim();

const inferOverrideArchetype = (label: string): ExpertRole["behavior"]["archetype"] => {
  const normalized = label.toLowerCase();

  if (
    /(sceptic|skeptic|contrarian|critic|devil|dissent|challenger|red team|risk)/.test(normalized)
  ) {
    return "adversarial";
  }
  if (/(synthesi|integrat|moderat|facilitat|mediator|coordinator|bridge)/.test(normalized)) {
    return "integrative";
  }
  if (/(creative|innovation|vision|imagin|brainstorm|ideation|invent)/.test(normalized)) {
    return "creative";
  }
  if (/(strategy|executive|cto|ceo|founder|planner|leadership|operator)/.test(normalized)) {
    return "strategic";
  }
  if (/(analyst|research|scient|data|engineer|evidence|quant)/.test(normalized)) {
    return "analytical";
  }

  return "analytical";
};

const extractRoleOverrideLabels = (templateData: TemplateData): string[] => {
  const source = [
    templateData.problemStatement,
    templateData.script,
    templateData.description ?? "",
  ].join("\n");

  const labels: string[] = [];
  const seen = new Set<string>();

  for (const match of source.matchAll(roleOverridePattern)) {
    const rawLabel = match[1] ?? "";
    const label = sanitizeOverrideLabel(rawLabel);
    if (!label) continue;
    const key = toRoleKey(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(label.slice(0, 120));
    if (labels.length >= 7) break;
  }

  return labels;
};

const extractJsonPayload = (value: string): string | null => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return value.slice(start, end + 1);
};

const extractBalancedJsonObjects = (value: string): string[] => {
  const results: string[] = [];
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (character === "\\") {
        escaping = true;
        continue;
      }
      if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (character === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        results.push(value.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  return results;
};

const stripCodeFences = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
  }
  return value;
};

const sanitizeLooseJson = (value: string): string =>
  value
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");

const parseAnalysisPayload = (
  rawText: string
): z.infer<typeof analysisSchema> | null => {
  const stripped = stripCodeFences(rawText);
  const balancedCandidates = [
    ...extractBalancedJsonObjects(rawText),
    ...extractBalancedJsonObjects(stripped),
  ];

  const candidates = [
    rawText,
    stripped,
    extractJsonPayload(rawText),
    extractJsonPayload(stripped),
    ...balancedCandidates,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim())
    .flatMap((value) => {
      const normalized = sanitizeLooseJson(value);
      return normalized === value ? [value] : [value, normalized];
    });

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const validated = analysisSchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
    } catch {
      continue;
    }
  }
  return null;
};

const clampTemperature = (value: number): number => {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
};

const toEligibleModelSet = (
  allowedModelIds?: string[] | null
): Set<string> | null => {
  if (!allowedModelIds || allowedModelIds.length === 0) {
    return null;
  }
  const cleaned = allowedModelIds
    .map((modelId) => modelId.trim())
    .filter((modelId) => modelId.length > 0);
  if (cleaned.length === 0) {
    return null;
  }
  return new Set(cleaned);
};

const isModelAllowed = (modelId: string, allowedSet: Set<string> | null): boolean =>
  !allowedSet || allowedSet.size === 0 || allowedSet.has(modelId);

const toProviderFromModelId = (modelId: string): string =>
  modelId.split("/")[0]?.trim() || "openrouter";

const toDisplayNameFromModelId = (modelId: string): string => {
  const suffix = modelId.split("/")[1] ?? modelId;
  return suffix
    .replace(/[-_]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
};

const chooseFallbackModelIdForArchetype = ({
  archetype,
  allowedSet,
}: {
  archetype: ExpertRole["behavior"]["archetype"];
  allowedSet: Set<string> | null;
}): string | null => {
  const archetypeCandidates = modelCandidatesForArchetype[archetype] ?? [];
  for (const candidate of archetypeCandidates) {
    if (isModelAllowed(candidate, allowedSet)) {
      return candidate;
    }
  }

  if (allowedSet && allowedSet.size > 0) {
    for (const candidate of allowedSet) {
      if (getModelById(candidate)) {
        return candidate;
      }
    }
    return allowedSet.values().next().value ?? null;
  }

  return preferredModelForArchetype[archetype] ?? null;
};

const normalizeRoleModel = ({
  role,
  allowedModelIds,
}: {
  role: ExpertRole;
  allowedModelIds?: string[] | null;
}): ExpertRole => {
  const allowedSet = toEligibleModelSet(allowedModelIds);
  const requestedModelId = role.model.modelId?.trim() || "";
  const fallbackModelId = chooseFallbackModelIdForArchetype({
    archetype: role.behavior.archetype,
    allowedSet,
  });

  const chosenModelId =
    requestedModelId && isModelAllowed(requestedModelId, allowedSet)
      ? requestedModelId
      : fallbackModelId || requestedModelId || preferredModelForArchetype[role.behavior.archetype];

  const knownModel = getModelById(chosenModelId);
  if (knownModel) {
    return {
      ...role,
      model: {
        provider: knownModel.provider,
        modelId: knownModel.id,
        displayName: knownModel.name,
      },
    };
  }

  return {
    ...role,
    model: {
      provider: toProviderFromModelId(chosenModelId),
      modelId: chosenModelId,
      displayName: toDisplayNameFromModelId(chosenModelId),
    },
  };
};

const createRoleOverrides = ({
  templateData,
  allowedModelIds,
}: {
  templateData: TemplateData;
  allowedModelIds?: string[] | null;
}): ExpertRole[] => {
  const overrideLabels = extractRoleOverrideLabels(templateData);

  return overrideLabels.map((label, index) => {
    const archetype = inferOverrideArchetype(label);
    const behaviorConfig = overrideBehaviorConfig[archetype];
    const behaviorLabel = label.toLowerCase();
    const normalizedTitle = toTitleCase(label) || `Participant ${index + 1}`;
    const role: ExpertRole = {
      id: `role_override_${toRoleSlug(label) || index + 1}`,
      title: normalizedTitle.slice(0, 120),
      category: "Debate Participant",
      icon: "users",
      description: `Generic debate participant with a ${behaviorLabel} perspective.`,
      focusAreas: [`${behaviorLabel} perspective`, ...behaviorConfig.focusAreas].slice(0, 8),
      behavior: {
        archetype,
        temperature: behaviorConfig.temperature,
        responseLength: behaviorConfig.responseLength,
        interactionStyle: [
          `adopts a ${behaviorLabel} stance`,
          ...behaviorConfig.interactionStyle,
        ].slice(0, 6),
      },
      model: {
        provider: "openrouter",
        modelId: preferredModelForArchetype[archetype],
        displayName: "OpenRouter Model",
      },
      whyIncluded: `Explicit override marker from template: ***${label}***.`,
      priority: index === 0 ? "critical" : "recommended",
    };
    return normalizeRoleModel({ role, allowedModelIds });
  });
};

const usesExclusiveOverrideMode = (overrideCount: number): boolean =>
  overrideCount >= MIN_ROLES_FOR_RUNNABLE_PANEL;

const mergePanelWithOverrideRoles = ({
  templateData,
  panel,
  maxRoles,
  allowedModelIds,
}: {
  templateData: TemplateData;
  panel: ExpertRole[];
  maxRoles: number;
  allowedModelIds?: string[] | null;
}): ExpertRole[] => {
  const overrideRoles = createRoleOverrides({ templateData, allowedModelIds });
  if (usesExclusiveOverrideMode(overrideRoles.length)) {
    return overrideRoles.slice(0, maxRoles);
  }

  const merged: ExpertRole[] = [];
  const seen = new Set<string>();

  const pushIfUnique = (role: ExpertRole) => {
    const roleKey = toRoleKey(role.title) || toRoleKey(role.id);
    if (!roleKey || seen.has(roleKey)) return;
    seen.add(roleKey);
    merged.push(role);
  };

  for (const role of overrideRoles) {
    pushIfUnique(role);
  }
  for (const role of panel) {
    pushIfUnique(normalizeRoleModel({ role, allowedModelIds }));
  }

  if (overrideRoles.length > 0 && merged.length < MIN_ROLES_FOR_RUNNABLE_PANEL) {
    const fallbackPanel = createFallbackPanel(templateData, allowedModelIds);
    for (const role of fallbackPanel) {
      pushIfUnique(role);
      if (merged.length >= MIN_ROLES_FOR_RUNNABLE_PANEL) break;
    }
  }

  return merged.slice(0, maxRoles);
};

export const applyTemplateRoleOverridesToPanel = ({
  templateData,
  panel,
  maxRoles = 12,
  allowedModelIds,
}: {
  templateData: TemplateData;
  panel: ExpertRole[];
  maxRoles?: number;
  allowedModelIds?: string[] | null;
}): ExpertRole[] =>
  mergePanelWithOverrideRoles({
    templateData,
    panel,
    maxRoles: Math.max(1, maxRoles),
    allowedModelIds,
  });

const mergeExpertPanelWithOverrides = ({
  templateData,
  panel,
  fallbackPanel,
  allowedModelIds,
}: {
  templateData: TemplateData;
  panel: ExpertRole[];
  fallbackPanel: ExpertRole[];
  allowedModelIds?: string[] | null;
}): ExpertRole[] => {
  const overrideCount = extractRoleOverrideLabels(templateData).length;
  const merged = applyTemplateRoleOverridesToPanel({
    templateData,
    panel,
    maxRoles: 7,
    allowedModelIds,
  });
  if (usesExclusiveOverrideMode(overrideCount)) {
    return merged.slice(0, 7);
  }

  const seen = new Set(merged.map((role) => toRoleKey(role.title) || toRoleKey(role.id)));

  if (merged.length < 4) {
    for (const role of fallbackPanel) {
      const roleKey = toRoleKey(role.title) || toRoleKey(role.id);
      if (!roleKey || seen.has(roleKey)) continue;
      seen.add(roleKey);
      merged.push(role);
      if (merged.length >= 4) break;
    }
  }

  return merged.slice(0, 7);
};

const recommendedStrategyFor = (templateData: TemplateData): string => {
  if (templateData.context.stakesLevel === "critical" || templateData.context.stakesLevel === "high") {
    return "debate_and_converge";
  }
  if (templateData.context.timeline === "urgent") {
    return "rapid_tradeoff_alignment";
  }
  if (templateData.type.includes("research")) {
    return "evidence_synthesis";
  }
  return "balanced_roundtable";
};

const complexityFor = (templateData: TemplateData): number => {
  let score = 5;
  if (templateData.context.stakesLevel === "critical") score += 3;
  if (templateData.context.stakesLevel === "high") score += 2;
  if (templateData.context.timeline === "urgent") score += 1;
  if (templateData.type.includes("architecture")) score += 1;
  if (templateData.context.companySize === "enterprise") score += 1;
  return Math.max(3, Math.min(10, score));
};

const createFallbackPanel = (
  templateData: TemplateData,
  allowedModelIds?: string[] | null
): ExpertRole[] => {
  const strategyRole: ExpertRole = {
    id: "role_cto",
    title: "Strategy Lead",
    category: "Executive Strategy",
    icon: "building-2",
    description: "Frames long-term implications and decision guardrails.",
    focusAreas: ["business alignment", "decision criteria", "long-term impact"],
    behavior: {
      archetype: "strategic",
      temperature: 0.45,
      responseLength: "comprehensive",
      interactionStyle: ["challenges assumptions", "prioritizes trade-offs", "keeps decision-oriented"],
    },
    model: {
      provider: "anthropic",
      modelId: preferredModelForArchetype.strategic,
      displayName: "Claude Sonnet 4",
    },
    whyIncluded: "Ensures recommendations map to business outcomes, not only technical quality.",
    priority: "critical",
  };

  const architectureRole: ExpertRole = {
    id: "role_architect",
    title: "Systems Architect",
    category: "Technical Architecture",
    icon: "cloud",
    description: "Validates feasibility, reliability, and scalability.",
    focusAreas: ["architecture options", "operational complexity", "performance"],
    behavior: {
      archetype: "analytical",
      temperature: 0.3,
      responseLength: "medium",
      interactionStyle: ["uses concrete constraints", "quantifies impacts", "flags unknowns"],
    },
    model: {
      provider: "google",
      modelId: preferredModelForArchetype.analytical,
      displayName: "Gemini 2.5 Pro",
    },
    whyIncluded: "Provides implementation realism and prevents strategy-only recommendations.",
    priority: "critical",
  };

  const riskRole: ExpertRole = {
    id: "role_risk",
    title: "Risk & Security Lead",
    category: "Risk Management",
    icon: "shield",
    description: "Stress-tests assumptions and identifies irreversible risks.",
    focusAreas: ["security", "compliance", "failure modes"],
    behavior: {
      archetype: "adversarial",
      temperature: 0.4,
      responseLength: "medium",
      interactionStyle: ["asks what could fail", "surfaces hidden dependencies", "forces mitigations"],
    },
    model: {
      provider: "openai",
      modelId: preferredModelForArchetype.adversarial,
      displayName: "o1 Mini",
    },
    whyIncluded: "Ensures high-confidence recommendations for high-stakes decisions.",
    priority: "critical",
  };

  const executionRole: ExpertRole = {
    id: "role_execution",
    title: "Delivery Lead",
    category: "Execution Planning",
    icon: "users",
    description: "Turns recommendations into staged execution plans.",
    focusAreas: ["timeline", "team impact", "rollout sequencing"],
    behavior: {
      archetype: "integrative",
      temperature: 0.5,
      responseLength: "medium",
      interactionStyle: ["builds consensus", "summarizes conflicts", "prioritizes feasible next steps"],
    },
    model: {
      provider: "openai",
      modelId: preferredModelForArchetype.integrative,
      displayName: "GPT-4o",
    },
    whyIncluded: "Bridges strategic and technical viewpoints into a practical plan.",
    priority: "recommended",
  };

  const financeRole: ExpertRole = {
    id: "role_finance",
    title: "FinOps Analyst",
    category: "Cost Governance",
    icon: "dollar-sign",
    description: "Keeps solutions aligned to budget and cost efficiency.",
    focusAreas: ["cost envelope", "unit economics", "budget risk"],
    behavior: {
      archetype: "analytical",
      temperature: 0.35,
      responseLength: "concise",
      interactionStyle: ["quantifies cost", "compares alternatives", "focuses on ROI"],
    },
    model: {
      provider: "google",
      modelId: preferredModelForArchetype.analytical,
      displayName: "Gemini 2.5 Pro",
    },
    whyIncluded: "Ensures recommendations are financially viable and measurable.",
    priority: "recommended",
  };

  const creativeRole: ExpertRole = {
    id: "role_innovation",
    title: "Innovation Catalyst",
    category: "Scenario Design",
    icon: "sparkles",
    description: "Introduces alternative options and non-obvious opportunities.",
    focusAreas: ["novel options", "upside scenarios", "differentiation"],
    behavior: {
      archetype: "creative",
      temperature: 0.75,
      responseLength: "medium",
      interactionStyle: ["suggests alternatives", "reframes constraints", "looks for leverage points"],
    },
    model: {
      provider: "anthropic",
      modelId: preferredModelForArchetype.creative,
      displayName: "Claude Sonnet 4.5",
    },
    whyIncluded: "Broadens option space before convergence.",
    priority: templateData.context.timeline === "urgent" ? "optional" : "recommended",
  };

  const panel =
    templateData.context.timeline === "urgent"
      ? [strategyRole, architectureRole, riskRole, executionRole]
      : [strategyRole, architectureRole, riskRole, executionRole, financeRole, creativeRole];

  return panel.map((role) => normalizeRoleModel({ role, allowedModelIds }));
};

const buildHeuristicAnalysis = (
  templateData: TemplateData,
  allowedModelIds?: string[] | null
): ChallengeAnalysis => {
  const complexityScore = complexityFor(templateData);
  const recommendedStrategy = recommendedStrategyFor(templateData);
  const fallbackPanel = createFallbackPanel(templateData, allowedModelIds);
  const expertPanel = mergeExpertPanelWithOverrides({
    templateData,
    panel: fallbackPanel,
    fallbackPanel,
    allowedModelIds,
  });
  const estimatedCost = estimateConferenceCost(expertPanel);

  return {
    problemType: templateData.type,
    complexityScore,
    complexityReason:
      complexityScore >= 8
        ? "High impact and multiple cross-functional constraints increase decision risk."
        : "Moderate cross-functional complexity with manageable implementation risk.",
    recommendedStrategy,
    strategyReason:
      recommendedStrategy === "debate_and_converge"
        ? "High-stakes decisions benefit from structured disagreement followed by explicit convergence."
        : "A balanced roundtable keeps momentum while preserving multi-role coverage.",
    keyConsiderations: [
      "implementation_risk",
      "organizational_impact",
      "cost_efficiency",
      "execution_velocity",
    ],
    expertPanel,
    estimatedDuration: templateData.context.timeline === "urgent" ? 30 : 45,
    estimatedCost,
    analysisSource: "heuristic",
  };
};

const normalizeAnalysis = (
  raw: z.infer<typeof analysisSchema>,
  templateData: TemplateData,
  allowedModelIds?: string[] | null
): ChallengeAnalysis => {
  const fallbackPanel = createFallbackPanel(templateData, allowedModelIds);
  let panel = raw.expertPanel.map((role, index) => {
    const normalizedRole: ExpertRole = {
      id: role.id || `role_${index + 1}`,
      title: role.title ?? `Expert ${index + 1}`,
      category: role.category ?? "General",
      icon: role.icon ?? "building-2",
      description: role.description ?? "Role description not provided.",
      focusAreas: (role.focusAreas ?? []).slice(0, 8),
      behavior: {
        archetype: role.behavior.archetype,
        temperature: clampTemperature(role.behavior.temperature),
        responseLength: role.behavior.responseLength,
        interactionStyle: role.behavior.interactionStyle.slice(0, 6),
      },
      model: {
        provider: role.model.provider ?? "openrouter",
        modelId: role.model.modelId ?? preferredModelForArchetype.analytical,
        displayName: role.model.displayName ?? "OpenRouter Model",
      },
      whyIncluded: role.whyIncluded ?? "Included for broad coverage.",
      priority: role.priority ?? "recommended",
    };
    return normalizeRoleModel({ role: normalizedRole, allowedModelIds });
  });

  panel = mergeExpertPanelWithOverrides({
    templateData,
    panel,
    fallbackPanel,
    allowedModelIds,
  });

  return {
    problemType: raw.problemType,
    complexityScore: Math.max(1, Math.min(10, Math.round(raw.complexityScore))),
    complexityReason: raw.complexityReason,
    recommendedStrategy: raw.recommendedStrategy,
    strategyReason: raw.strategyReason,
    keyConsiderations: raw.keyConsiderations,
    expertPanel: panel,
    estimatedDuration: Math.max(10, Math.min(180, Math.round(raw.estimatedDuration))),
    estimatedCost: resolveEstimatedCost(
      panel,
      raw.estimatedCost
        ? {
            min: raw.estimatedCost.min,
            max: raw.estimatedCost.max,
          }
        : null
    ),
    analysisSource: "ai",
  };
};

const buildAllowedModelBlock = (allowedModelIds?: string[] | null): string => {
  if (!allowedModelIds || allowedModelIds.length === 0) {
    return "";
  }

  const uniqueModelIds = Array.from(
    new Set(
      allowedModelIds
        .map((modelId) => modelId.trim())
        .filter((modelId) => modelId.length > 0)
    )
  );

  if (uniqueModelIds.length === 0) {
    return "";
  }

  const listedModelIds = uniqueModelIds.slice(0, MAX_ALLOWED_MODELS_IN_PROMPT);
  const remainingCount = uniqueModelIds.length - listedModelIds.length;

  return `
ALLOWED OPENROUTER MODEL IDS:
${listedModelIds.map((modelId) => `- ${modelId}`).join("\n")}
${remainingCount > 0 ? `- ...and ${remainingCount} more allowed models not shown` : ""}
Only use model.modelId values from this allowed list.
`;
};

const buildAnalysisPrompt = (
  templateData: TemplateData,
  allowedModelIds?: string[] | null
): string => {
  const overrideLabels = extractRoleOverrideLabels(templateData);
  const overrideCount = overrideLabels.length;
  const hasOverrides = overrideLabels.length > 0;
  const requiresSupplementalRoles =
    hasOverrides && !usesExclusiveOverrideMode(overrideCount);
  const allowedModelBlock = buildAllowedModelBlock(allowedModelIds);
  const roleOverrideBlock =
    hasOverrides
      ? `
EXPLICIT ROLE OVERRIDES:
${overrideLabels.map((label) => `- ***${label}***`).join("\n")}
Use each override exactly once in expertPanel.
${requiresSupplementalRoles
  ? `Add supplemental AI-selected roles so expertPanel has at least ${MIN_ROLES_FOR_RUNNABLE_PANEL} total roles.`
  : `Do not add any extra roles beyond this override list.
Set expertPanel length to exactly ${overrideLabels.length}.`}
For each override role:
- set "category" to "Debate Participant"
- keep the marker meaning in title and behavior (example: sceptic -> adversarial)
`
      : "";

  return `
You configure expert AI panels for multi-agent conferences.
Return JSON only.

CHALLENGE:
${templateData.problemStatement}

TEMPLATE CONTEXT:
- Problem Type: ${templateData.type}
- Company Size: ${templateData.context.companySize}
- Stakes Level: ${templateData.context.stakesLevel}
- Timeline: ${templateData.context.timeline}
- Budget: ${templateData.context.budget}
${roleOverrideBlock}
${allowedModelBlock}

REQUIREMENTS:
1. Classify the problem type.
2. Set complexity score (1-10) with rationale.
3. Recommend strategy name and reason.
4. ${hasOverrides
  ? requiresSupplementalRoles
    ? `Use all explicit override roles and add supplemental roles until there are at least ${MIN_ROLES_FOR_RUNNABLE_PANEL} roles.`
    : "Use only the explicit override roles."
  : "Propose 4-7 roles with explicit value for this challenge."}
5. Include behavior archetype, temperature (0-1), response length, and interaction style.
6. Assign practical OpenRouter model IDs (avoid placeholders).
7. Provide estimated duration (minutes) and estimated cost range (USD).

BEHAVIOR ARCHETYPES:
- analytical (0.2-0.4)
- strategic (0.4-0.7)
- adversarial (0.3-0.5)
- integrative (0.4-0.6)
- creative (0.6-0.9)

Return this JSON shape:
{
  "problemType": "technical_architecture",
  "complexityScore": 8,
  "complexityReason": "...",
  "recommendedStrategy": "debate_and_converge",
  "strategyReason": "...",
  "keyConsiderations": ["..."],
  "expertPanel": [
    {
      "id": "role_1",
      "title": "CTO",
      "category": "Strategic Tech",
      "icon": "building-2",
      "description": "...",
      "focusAreas": ["..."],
      "behavior": {
        "archetype": "strategic",
        "temperature": 0.4,
        "responseLength": "comprehensive",
        "interactionStyle": ["..."]
      },
      "model": {
        "provider": "anthropic",
        "modelId": "anthropic/claude-sonnet-4",
        "displayName": "Claude Sonnet 4"
      },
      "whyIncluded": "...",
      "priority": "critical"
    }
  ],
  "estimatedDuration": 45,
  "estimatedCost": { "min": 2.5, "max": 6.0 }
}
`;
};

const buildJsonRepairPrompt = (rawOutput: string): string => `
Fix this output into valid JSON that matches the required schema exactly.
Return JSON only. No markdown. No explanation.

OUTPUT TO FIX:
${rawOutput}
`;

export const analyzeChallengeWithAI = async ({
  templateData,
  apiKey,
  allowedModelIds,
}: {
  templateData: TemplateData;
  apiKey: string | null;
  allowedModelIds?: string[] | null;
}): Promise<ChallengeAnalysis> => {
  const fallback = buildHeuristicAnalysis(templateData, allowedModelIds);
  if (!apiKey) return fallback;

  const analyzerModels = [
    PRIMARY_ANALYZER_MODEL_ID,
    FALLBACK_ANALYZER_MODEL_ID,
  ];

  const attemptModelAnalysis = async (modelId: string): Promise<ChallengeAnalysis | null> => {
    const baseMessages = [
      {
        role: "system" as const,
        content:
          "You are a configuration engine. Output valid JSON only. No markdown. No backticks.",
      },
      {
        role: "user" as const,
        content: buildAnalysisPrompt(templateData, allowedModelIds),
      },
    ];

    const aiResponse = await callOpenRouter({
      apiKey,
      modelId,
      messages: baseMessages,
      timeoutMs: 35_000,
      maxRetries: 1,
      temperature: 0,
      responseFormat: { type: "json_object" },
    });

    if (!aiResponse.ok) {
      return null;
    }

    const validated = parseAnalysisPayload(aiResponse.content);
    if (validated) {
      return normalizeAnalysis(validated, templateData, allowedModelIds);
    }

    const repairResponse = await callOpenRouter({
      apiKey,
      modelId,
      messages: [
        ...baseMessages,
        {
          role: "assistant",
          content: aiResponse.content,
        },
        {
          role: "user",
          content: buildJsonRepairPrompt(aiResponse.content),
        },
      ],
      timeoutMs: 25_000,
      maxRetries: 0,
      temperature: 0,
      responseFormat: { type: "json_object" },
    });

    if (!repairResponse.ok) {
      return null;
    }

    const repaired = parseAnalysisPayload(repairResponse.content);
    if (repaired) {
      return normalizeAnalysis(repaired, templateData, allowedModelIds);
    }

    return null;
  };

  for (const modelId of analyzerModels) {
    const analysis = await attemptModelAnalysis(modelId);
    if (analysis) {
      return analysis;
    }
  }

  return fallback;
};
