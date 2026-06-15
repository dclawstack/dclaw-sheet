import { env } from "@/lib/env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  finishReason: string | null;
  ok: boolean;
  error?: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the model for a strict JSON object response. */
  json?: boolean;
  signal?: AbortSignal;
}

const TIMEOUT_MS = 60_000;

/**
 * Single OpenRouter chat completion. Never throws on API/network errors — returns
 * { ok: false } so callers (especially parallel consensus fan-outs) degrade gracefully.
 */
export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const base: ChatResult = {
    text: "",
    model: opts.model,
    promptTokens: 0,
    completionTokens: 0,
    finishReason: null,
    ok: false,
  };

  if (!env.OPENROUTER_API_KEY) {
    return { ...base, error: "OPENROUTER_API_KEY not set" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (opts.signal) opts.signal.addEventListener("abort", () => controller.abort());

  try {
    const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": env.OPENROUTER_SITE_URL,
        "X-Title": env.OPENROUTER_APP_NAME,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 1500,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ...base, error: `HTTP ${res.status}: ${body.slice(0, 300)}` };
    }

    const data = (await res.json()) as any;
    const choice = data.choices?.[0];
    return {
      text: choice?.message?.content ?? "",
      model: data.model ?? opts.model,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      finishReason: choice?.finish_reason ?? null,
      ok: true,
    };
  } catch (e: any) {
    return { ...base, error: e?.name === "AbortError" ? "timeout" : String(e?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse a JSON object out of a model response, tolerating ```json fences and prose. */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // last resort: grab the outermost { ... }
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
