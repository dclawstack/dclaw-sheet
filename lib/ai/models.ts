/**
 * Model catalog for the consensus router.
 *
 * Token efficiency is the whole point: every task is classified into a tier, and we
 * spend the cheapest model that clears the tier's quality bar. Only genuinely hard,
 * high-stakes tasks (SQL generation, schema inference) pay for a multi-model consensus.
 *
 * Prices are USD per 1M tokens (input/output), approximate OpenRouter list prices used
 * for the cost ledger; refreshable at runtime via fetchLivePricing().
 */

export type Tier = "trivial" | "standard" | "hard";

export type TaskType =
  | "classify"
  | "clean"
  | "chart_spec"
  | "copilot"
  | "forecast_explain"
  | "schema_infer"
  | "sql_gen";

export interface ModelSpec {
  id: string; // OpenRouter model id
  label: string;
  inUsdPerM: number;
  outUsdPerM: number;
  strength: 1 | 2 | 3 | 4 | 5; // rough reasoning strength
}

export const MODELS: Record<string, ModelSpec> = {
  "google/gemini-2.0-flash-lite-001": {
    id: "google/gemini-2.0-flash-lite-001",
    label: "Gemini 2.0 Flash Lite",
    inUsdPerM: 0.075,
    outUsdPerM: 0.3,
    strength: 2,
  },
  "openai/gpt-4o-mini": {
    id: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    inUsdPerM: 0.15,
    outUsdPerM: 0.6,
    strength: 3,
  },
  "google/gemini-2.0-flash-001": {
    id: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    inUsdPerM: 0.1,
    outUsdPerM: 0.4,
    strength: 3,
  },
  "deepseek/deepseek-chat": {
    id: "deepseek/deepseek-chat",
    label: "DeepSeek V3",
    inUsdPerM: 0.27,
    outUsdPerM: 1.1,
    strength: 4,
  },
  "anthropic/claude-3.5-sonnet": {
    id: "anthropic/claude-3.5-sonnet",
    label: "Claude 3.5 Sonnet",
    inUsdPerM: 3.0,
    outUsdPerM: 15.0,
    strength: 5,
  },
  "openai/gpt-4o": {
    id: "openai/gpt-4o",
    label: "GPT-4o",
    inUsdPerM: 2.5,
    outUsdPerM: 10.0,
    strength: 5,
  },
};

/** Cheapest-first single-model ladder per tier. We climb only on low confidence. */
export const TIER_LADDER: Record<Tier, string[]> = {
  trivial: ["google/gemini-2.0-flash-lite-001", "openai/gpt-4o-mini"],
  standard: ["google/gemini-2.0-flash-001", "openai/gpt-4o-mini", "deepseek/deepseek-chat"],
  hard: ["deepseek/deepseek-chat", "anthropic/claude-3.5-sonnet", "openai/gpt-4o"],
};

/** For hard tasks we run a diverse pool in parallel and reconcile their answers. */
export const CONSENSUS_POOL: string[] = [
  "deepseek/deepseek-chat",
  "anthropic/claude-3.5-sonnet",
  "openai/gpt-4o",
];

/** Strong arbiter used to break ties between consensus candidates. */
export const ARBITER = "anthropic/claude-3.5-sonnet";

/** Which tier a task type defaults to (the classifier can still bump it up). */
export const TASK_DEFAULT_TIER: Record<TaskType, Tier> = {
  classify: "trivial",
  clean: "trivial",
  chart_spec: "standard",
  copilot: "standard",
  forecast_explain: "standard",
  schema_infer: "hard",
  sql_gen: "hard",
};

export function costOf(modelId: string, promptTokens: number, completionTokens: number): number {
  const m = MODELS[modelId];
  if (!m) return 0;
  return (promptTokens / 1e6) * m.inUsdPerM + (completionTokens / 1e6) * m.outUsdPerM;
}
