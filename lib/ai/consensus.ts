import { chat, parseJsonLoose, type ChatMessage } from "./openrouter";
import {
  ARBITER,
  CONSENSUS_POOL,
  TASK_DEFAULT_TIER,
  TIER_LADDER,
  costOf,
  type TaskType,
  type Tier,
} from "./models";
import { aiEnabled, dbEnabled } from "@/lib/env";

export interface CompleteParams {
  taskType: TaskType;
  user: string;
  system?: string;
  json?: boolean;
  /** Force a tier instead of the task default. */
  tier?: Tier;
  workspaceId?: string;
  maxTokens?: number;
  /** Normalizes a response for consensus voting (default: trimmed lowercase). */
  normalize?: (text: string) => string;
}

export interface CompleteResult {
  text: string;
  json: unknown | null;
  tier: Tier;
  modelsUsed: string[];
  chosenModel: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
  agreement: number | null; // null for non-consensus tiers
  ok: boolean;
  error?: string;
}

const defaultNormalize = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();

function nowMs(): number {
  // performance.now is available in the Node/Edge runtimes Vercel uses.
  return typeof performance !== "undefined" ? performance.now() : 0;
}

function messages(p: CompleteParams): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  if (p.system) msgs.push({ role: "system", content: p.system });
  msgs.push({ role: "user", content: p.user });
  return msgs;
}

/**
 * Unified AI entry point. Routes by tier:
 *  - trivial/standard → single cheapest model, climb the ladder only on failure
 *  - hard            → run a diverse pool in parallel, reconcile by majority vote,
 *                      break ties with a strong arbiter
 * Always records a row in ai_runs (best-effort) for the token/cost ledger.
 */
export async function complete(p: CompleteParams): Promise<CompleteResult> {
  const tier = p.tier ?? TASK_DEFAULT_TIER[p.taskType];
  const t0 = nowMs();

  const empty: CompleteResult = {
    text: "",
    json: null,
    tier,
    modelsUsed: [],
    chosenModel: null,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    latencyMs: 0,
    agreement: null,
    ok: false,
  };

  if (!aiEnabled()) {
    return { ...empty, error: "OPENROUTER_API_KEY not set — add it to .env.local (see SETUP-KEYS.md)" };
  }

  const result = tier === "hard" ? await runConsensus(p, tier) : await runLadder(p, tier);
  result.latencyMs = Math.round(nowMs() - t0);

  void logRun(p, result); // fire-and-forget
  return result;
}

async function runLadder(p: CompleteParams, tier: Tier): Promise<CompleteResult> {
  const ladder = TIER_LADDER[tier];
  const used: string[] = [];
  let prompt = 0;
  let completion = 0;
  let cost = 0;

  for (const model of ladder) {
    used.push(model);
    const r = await chat({
      model,
      messages: messages(p),
      json: p.json,
      maxTokens: p.maxTokens,
    });
    prompt += r.promptTokens;
    completion += r.completionTokens;
    cost += costOf(model, r.promptTokens, r.completionTokens);

    if (r.ok && r.text.trim()) {
      return {
        text: r.text,
        json: p.json ? parseJsonLoose(r.text) : null,
        tier,
        modelsUsed: used,
        chosenModel: model,
        promptTokens: prompt,
        completionTokens: completion,
        costUsd: cost,
        latencyMs: 0,
        agreement: null,
        ok: true,
      };
    }
    // else climb to the next, sturdier model in the ladder
  }

  return {
    text: "",
    json: null,
    tier,
    modelsUsed: used,
    chosenModel: null,
    promptTokens: prompt,
    completionTokens: completion,
    costUsd: cost,
    latencyMs: 0,
    agreement: null,
    ok: false,
    error: "all models in tier failed",
  };
}

async function runConsensus(p: CompleteParams, tier: Tier): Promise<CompleteResult> {
  const pool = CONSENSUS_POOL;
  const normalize = p.normalize ?? defaultNormalize;

  const responses = await Promise.all(
    pool.map((model) =>
      chat({ model, messages: messages(p), json: p.json, maxTokens: p.maxTokens }).then((r) => ({
        model,
        r,
      }))
    )
  );

  let prompt = 0;
  let completion = 0;
  let cost = 0;
  for (const { model, r } of responses) {
    prompt += r.promptTokens;
    completion += r.completionTokens;
    cost += costOf(model, r.promptTokens, r.completionTokens);
  }

  const good = responses.filter(({ r }) => r.ok && r.text.trim());
  if (good.length === 0) {
    return {
      text: "",
      json: null,
      tier,
      modelsUsed: pool,
      chosenModel: null,
      promptTokens: prompt,
      completionTokens: completion,
      costUsd: cost,
      latencyMs: 0,
      agreement: 0,
      ok: false,
      error: "consensus pool all failed",
    };
  }

  // Majority vote over normalized answers.
  const groups = new Map<string, { count: number; model: string; text: string }>();
  for (const { model, r } of good) {
    const key = normalize(r.text);
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { count: 1, model, text: r.text });
  }

  let best = { count: 0, model: good[0].model, text: good[0].r.text };
  for (const g of groups.values()) if (g.count > best.count) best = g;

  const agreement = best.count / good.length;

  // Clear majority → take it. Otherwise let a strong arbiter choose among candidates.
  if (best.count >= Math.ceil(good.length / 2) && groups.size < good.length) {
    return finalize(best.text, best.model, pool, prompt, completion, cost, agreement, tier, p);
  }

  const arb = await arbitrate(
    p,
    good.map(({ model, r }) => ({ model, text: r.text }))
  );
  prompt += arb.promptTokens;
  completion += arb.completionTokens;
  cost += costOf(ARBITER, arb.promptTokens, arb.completionTokens);

  const chosen = arb.text.trim() ? arb.text : best.text;
  const chosenModel = arb.text.trim() ? ARBITER : best.model;
  return finalize(chosen, chosenModel, [...pool, ARBITER], prompt, completion, cost, agreement, tier, p);
}

function finalize(
  text: string,
  model: string,
  used: string[],
  prompt: number,
  completion: number,
  cost: number,
  agreement: number,
  tier: Tier,
  p: CompleteParams
): CompleteResult {
  return {
    text,
    json: p.json ? parseJsonLoose(text) : null,
    tier,
    modelsUsed: used,
    chosenModel: model,
    promptTokens: prompt,
    completionTokens: completion,
    costUsd: cost,
    latencyMs: 0,
    agreement,
    ok: true,
  };
}

async function arbitrate(p: CompleteParams, candidates: { model: string; text: string }[]) {
  const list = candidates
    .map((c, i) => `### Candidate ${i + 1} (from ${c.model})\n${c.text}`)
    .join("\n\n");
  return chat({
    model: ARBITER,
    json: p.json,
    maxTokens: p.maxTokens,
    messages: [
      {
        role: "system",
        content:
          "You are an arbiter. Several models answered the same task and disagreed. " +
          "Choose the single best, most correct answer and return it VERBATIM — no commentary, " +
          (p.json ? "as a raw JSON object." : "as plain text."),
      },
      { role: "user", content: `TASK:\n${p.user}\n\nCANDIDATES:\n${list}` },
    ],
  });
}

async function logRun(p: CompleteParams, r: CompleteResult): Promise<void> {
  if (!dbEnabled()) return;
  try {
    const { getDb } = await import("@/db/client");
    const { aiRuns } = await import("@/db/schema");
    await getDb()
      .insert(aiRuns)
      .values({
        workspaceId: p.workspaceId ?? null,
        taskType: p.taskType,
        tier: r.tier,
        models: r.modelsUsed,
        chosenModel: r.chosenModel,
        consensus: { agreement: r.agreement },
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        costUsd: r.costUsd,
        latencyMs: r.latencyMs,
        ok: r.ok,
      });
  } catch {
    // never let logging break the request
  }
}
