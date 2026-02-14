import { getModelById } from "@/data/openRouterModels";
import type { ExpertRole } from "@/lib/configuration/types";

type CostRange = {
  min: number;
  max: number;
};

const DEFAULT_ROUNDS = 3;
const DEFAULT_PROMPT_TOKENS = 1800;
const DEFAULT_COMPLETION_TOKENS = 700;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const fallbackUsdPerMillion = (archetype: ExpertRole["behavior"]["archetype"]) => {
  if (archetype === "creative") return { input: 2.2, output: 8 };
  if (archetype === "strategic") return { input: 2.5, output: 9 };
  if (archetype === "integrative") return { input: 2.0, output: 7 };
  if (archetype === "adversarial") return { input: 1.5, output: 5 };
  return { input: 1.2, output: 4 };
};

const estimateRoleCostPerTurn = (role: ExpertRole): number => {
  const model = getModelById(role.model.modelId);
  const pricing = model?.pricing ?? fallbackUsdPerMillion(role.behavior.archetype);
  const inputUsd = (DEFAULT_PROMPT_TOKENS / 1_000_000) * Number(pricing.input ?? 0);
  const outputUsd = (DEFAULT_COMPLETION_TOKENS / 1_000_000) * Number(pricing.output ?? 0);
  return Math.max(0, inputUsd + outputUsd);
};

export const estimateConferenceCost = (
  panel: ExpertRole[],
  options?: {
    rounds?: number;
  }
): CostRange => {
  if (!panel.length) return { min: 0, max: 0 };

  const rounds = Math.max(1, options?.rounds ?? DEFAULT_ROUNDS);
  const totalUsd =
    panel.reduce((sum, role) => sum + estimateRoleCostPerTurn(role), 0) * rounds;

  const min = Math.max(0.25, totalUsd * 0.85);
  const max = Math.max(min + 0.15, totalUsd * 1.35);

  return {
    min: round2(min),
    max: round2(max),
  };
};

export const resolveEstimatedCost = (
  panel: ExpertRole[],
  aiCost?: CostRange | null
): CostRange => {
  if (aiCost && aiCost.max > 0) {
    return {
      min: round2(Math.max(0, aiCost.min)),
      max: round2(Math.max(aiCost.min, aiCost.max)),
    };
  }
  return estimateConferenceCost(panel);
};

