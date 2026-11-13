import type { TItem } from "@/lib/translations";

// Machine translation. Uses Google Gemini if GEMINI_API_KEY is set, otherwise
// Anthropic if ANTHROPIC_API_KEY is set. TRANSLATION_MODEL optionally
// overrides the default model of whichever provider is used.

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5";
// Tried in order; Google's free tier sometimes returns "high demand" or
// retires a model, so we fall through to the next one.
const GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

export const LOCALE_NAMES: Record<string, string> = {
  vi: "Vietnamese",
};

export function translationConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = (language: string) => `You translate e-learning content for Premier Data, a sports data company whose staff learn to code and verify live sports event data (mainly soccer: passes, tackles, shots, possession, xG, event tagging, QA of data accuracy).

Translate from English into natural, professional ${language} for working adults.
Rules:
- Keep proper nouns, brand names (e.g. Premier Data), player/team names, numbers, units, URLs and e-mail addresses unchanged.
- Items marked html:true contain HTML. Keep every tag and attribute exactly as is; translate only the human-readable text between tags.
- Keep established English football/data terms when that is how practitioners say it (e.g. xG, VAR, offside) or add the English term in brackets on first use if unsure.
- Keep the same tone and length; do not add explanations or omit content.
- Quiz option text is short; keep it short.
Reply with ONLY a JSON array of strings, the same length and order as the input array. No markdown fences, no commentary.`;

type Piece = { text: string; html: boolean };

/** fetch with retries for temporary overload / rate-limit errors. */
async function fetchWithRetry(url: string, init: RequestInit, retries = 4): Promise<Response> {
  const delays = [2000, 5000, 10000, 20000].slice(0, retries);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const temporary = res.status === 429 || res.status === 500 || res.status === 503;
    if (!temporary || attempt >= delays.length) return res;
    await new Promise((r) => setTimeout(r, delays[attempt]));
  }
}

function parseResult(raw: string, expected: number): string[] {
  // Tolerate accidental code fences.
  const out = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(out);
  if (!Array.isArray(parsed) || parsed.length !== expected || parsed.some((s) => typeof s !== "string")) {
    throw new Error("Translation service returned an unexpected response.");
  }
  return parsed as string[];
}

async function callGemini(pieces: Piece[], language: string, key: string): Promise<string[]> {
  const models = process.env.TRANSLATION_MODEL
    ? [process.env.TRANSLATION_MODEL, ...GEMINI_MODELS]
    : GEMINI_MODELS;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM(language) }] },
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify(pieces.map((p) => ({ html: p.html, text: p.text }))) }],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  });

  let lastError = "";
  for (const model of models) {
    let res: Response;
    try {
      res = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body,
          signal: AbortSignal.timeout(90_000),
        },
        1
      );
    } catch (e) {
      lastError = `${model}: ${e instanceof Error ? e.message : "request failed"}`;
      continue; // timeout / network: try the next model
    }
    if (res.ok) {
      const data = await res.json();
      const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("");
      try {
        return parseResult(text, pieces.length);
      } catch (e) {
        lastError = `${model}: ${e instanceof Error ? e.message : "bad response"}`;
        continue;
      }
    }
    const errBody = await res.text().catch(() => "");
    lastError = `${model}: ${res.status} ${errBody.slice(0, 150)}`;
    // Overloaded, rate-limited or retired: try the next model. Anything else
    // (bad key, bad request) will fail the same way everywhere.
    if (![404, 429, 500, 503].includes(res.status)) break;
  }
  throw new Error(`Translation service error — ${lastError}`);
}

async function callModel(pieces: Piece[], language: string): Promise<string[]> {
  const gemini = process.env.GEMINI_API_KEY;
  if (gemini) return callGemini(pieces, language, gemini);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No translation API key is set (GEMINI_API_KEY or ANTHROPIC_API_KEY).");

  const res = await fetchWithRetry(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.TRANSLATION_MODEL || DEFAULT_MODEL,
      max_tokens: 8000,
      temperature: 0,
      system: SYSTEM(language),
      messages: [
        {
          role: "user",
          content: JSON.stringify(pieces.map((p) => ({ html: p.html, text: p.text }))),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Translation service error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const out: string = (data?.content ?? [])
    .filter((c: { type: string }) => c.type === "text")
    .map((c: { text: string }) => c.text)
    .join("");
  return parseResult(out, pieces.length);
}

/** Translate items in size-limited batches. Order of results matches input. */
export async function translateItems(items: TItem[], locale: string): Promise<string[]> {
  const language = LOCALE_NAMES[locale] ?? locale;
  const results: string[] = new Array(items.length);

  // Batch by count and by total characters.
  const batches: number[][] = [];
  let cur: number[] = [];
  let chars = 0;
  items.forEach((it, i) => {
    if (cur.length >= 20 || (cur.length > 0 && chars + it.text.length > 6000)) {
      batches.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(i);
    chars += it.text.length;
  });
  if (cur.length) batches.push(cur);

  // A few batches in parallel.
  const CONCURRENCY = 3;
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    await Promise.all(
      batches.slice(i, i + CONCURRENCY).map(async (idxs) => {
        const out = await callModel(
          idxs.map((k) => ({ text: items[k].text, html: items[k].html })),
          language
        );
        idxs.forEach((k, j) => (results[k] = out[j]));
      })
    );
  }
  return results;
}
