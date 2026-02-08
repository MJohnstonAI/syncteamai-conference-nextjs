import "server-only";

import { getModelById } from "@/data/openRouterModels";
import { getSupabaseAdminClient } from "@/lib/server/supabase-server";

type UsageInsert = {
  userId: string;
  conversationId: string | null;
  roundId: string | null;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: "success" | "error";
  statusCode: number;
  requestId: string | null;
};

const safeNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const estimateCostCents = ({
  modelId,
  promptTokens,
  completionTokens,
}: {
  modelId: string;
  promptTokens: number;
  completionTokens: number;
}): { costCents: number | null; unitPriceUsd: number | null } => {
  const model = getModelById(modelId);
  if (!model?.pricing) {
    return { costCents: null, unitPriceUsd: null };
  }

  // Pricing data is modeled as USD per 1M tokens.
  const inputPerMillion = safeNumber(model.pricing.input);
  const outputPerMillion = safeNumber(model.pricing.output);
  const usd =
    (promptTokens * inputPerMillion + completionTokens * outputPerMillion) /
    1_000_000;
  const totalTokens = Math.max(1, promptTokens + completionTokens);
  const unitPriceUsd = (usd / totalTokens) * 1_000_000;
  return {
    costCents: Math.max(0, Math.round(usd * 100)),
    unitPriceUsd,
  };
};

export const writeUsageEvent = async (payload: UsageInsert): Promise<void> => {
  const promptTokens = Math.max(0, safeNumber(payload.promptTokens));
  const completionTokens = Math.max(0, safeNumber(payload.completionTokens));
  const totalTokens = Math.max(
    0,
    payload.totalTokens || promptTokens + completionTokens
  );
  const { costCents, unitPriceUsd } = estimateCostCents({
    modelId: payload.modelId,
    promptTokens,
    completionTokens,
  });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("turn_usage_events").insert({
    user_id: payload.userId,
    conversation_id: payload.conversationId,
    round_id: payload.roundId,
    provider: "openrouter",
    model_id: payload.modelId,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    unit_price_usd: unitPriceUsd,
    cost_cents: costCents,
    latency_ms: Math.max(0, safeNumber(payload.latencyMs)),
    status: payload.status,
    status_code: payload.statusCode,
    request_id: payload.requestId,
  });

  if (error) {
    throw new Error(error.message);
  }
};
