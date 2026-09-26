import { getAiKey } from "./aiKey";

const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";
const MIN_CONFIDENCE = 0.7;

export type ApiHealth =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

/**
 * Cheap key check: asks OpenRouter who this key belongs to.
 * Costs nothing, categorizes nothing.
 */
export async function checkApiKey(timeoutMs: number = 8000): Promise<ApiHealth> {
  const key = await getAiKey();
  if (!key) return { ok: false, detail: "No key saved yet." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: "Key rejected — check for typos or a revoked key." };
    }
    if (!res.ok) return { ok: false, detail: `Service error (${res.status}). Try again.` };
    const json = (await res.json()) as {
      data?: { label?: string; usage?: number; limit?: number | null };
    };
    const left =
      json.data && typeof json.data.limit === "number"
        ? ` · $${Math.max(json.data.limit - (json.data.usage ?? 0), 0).toFixed(2)} credits left`
        : "";
    return { ok: true, detail: `Connected${left}. Siri can use AI.` };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, detail: "Timed out — check your internet." };
    }
    return { ok: false, detail: "No internet — AI needs a connection." };
  } finally {
    clearTimeout(timer);
  }
}

export type AiCategoryResult = {
  category: string;
  confidence: number;
};

type Answers = {
  category?: {
    choice?: string;
    confidence?: number;
  };
};

/**
 * Asks Jev to pick a category for a note. Throws with a human message on
 * any failure — callers fall back to keyword rules. Never logs the key.
 */
export async function suggestCategory(
  note: string,
  categories: { id: string; name: string }[],
  timeoutMs: number = 8000
): Promise<AiCategoryResult> {
  const key = await getAiKey();
  if (!key) throw new Error("No API key saved.");

  const criteria: Record<string, string> = {};
  for (const c of categories) criteria[c.id] = c.name;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let json: { answers?: Answers };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        state: `User spent money on: ${note}`,
        questions: {
          category: {
            type: "choice",
            instructions: "Which expense category fits best?",
            criteria,
          },
        },
      }),
      signal: controller.signal,
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Key rejected. Check the key in Settings.");
    }
    if (res.status === 402) {
      throw new Error("Credits over. Top up OpenRouter.");
    }
    if (!res.ok) throw new Error(`AI unavailable (${res.status}).`);
    json = (await res.json()) as { answers?: Answers };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("AI timed out.");
    }
    throw e instanceof Error ? e : new Error("AI unavailable.");
  } finally {
    clearTimeout(timer);
  }

  const pick = json.answers?.category;
  const choice = pick?.choice ?? "";
  const confidence = Number(pick?.confidence ?? 0);
  if (!choice || !criteria[choice]) throw new Error("AI gave no usable answer.");
  if (!(confidence >= MIN_CONFIDENCE)) {
    throw new Error(`AI unsure (${Math.round(confidence * 100)}%).`);
  }
  return { category: choice, confidence };
}
