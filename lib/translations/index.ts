// Shared helpers for translated course content. Safe to import from both
// server and client code (no server-only imports).
//
// Original English text lives in the normal tables. Translations live in
// `content_translations` and are swapped in at render time; anything missing
// falls back to the English original.

export type TranslatableEntity =
  | "course"
  | "module"
  | "lesson"
  | "page"
  | "block"
  | "quiz_question"
  | "quiz_option"
  | "quiz_config";

/** One string that can be translated. */
export type TItem = {
  entity: TranslatableEntity;
  id: string;
  field: string;
  /** the English source text */
  text: string;
  /** true when the text is HTML (tags must be preserved) */
  html: boolean;
  /** human-friendly location, for the review screen */
  label: string;
};

export type TRow = {
  entity: string;
  entity_id: string;
  field: string;
  text: string;
  source_hash?: string;
  edited?: boolean;
};

export type TMap = Map<string, string>;

export const itemKey = (entity: string, id: string, field: string) =>
  `${entity}|${id}|${field}`;

/** Fast, non-cryptographic 53-bit string hash (cyrb53). */
export function hashText(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function buildMap(rows: TRow[] | null | undefined): TMap {
  const m: TMap = new Map();
  for (const r of rows ?? []) {
    if (r.text && r.text.trim()) m.set(itemKey(r.entity, r.entity_id, r.field), r.text);
  }
  return m;
}

/** Translated text if present, otherwise the original. */
export function tx<T extends string | null | undefined>(
  map: TMap | null,
  entity: TranslatableEntity,
  id: string,
  field: string,
  original: T
): T | string {
  if (!map) return original;
  return map.get(itemKey(entity, id, field)) ?? original;
}

/**
 * Load every translation for one course in a locale (paged past the 1000-row
 * default). Returns null for English so callers can skip the swap entirely.
 */
export async function fetchCourseMap(
  supabase: unknown,
  courseId: string,
  locale: string
): Promise<TMap | null> {
  if (locale === "en") return null;
  const rows: TRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("content_translations")
      .select("entity, entity_id, field, text")
      .eq("course_id", courseId)
      .eq("locale", locale)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as TRow[]));
    if (data.length < PAGE) break;
  }
  return buildMap(rows);
}

/** Translations of course titles/descriptions only (for course lists). */
export async function fetchCourseTitleMap(
  supabase: unknown,
  courseIds: string[],
  locale: string
): Promise<TMap | null> {
  if (locale === "en" || courseIds.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("content_translations")
    .select("entity, entity_id, field, text")
    .eq("entity", "course")
    .eq("locale", locale)
    .in("entity_id", courseIds);
  return buildMap((data ?? []) as TRow[]);
}

// --- JSON-valued content (question blocks, coding drills) ---

function parseJson(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    try {
      const v = raw ? JSON.parse(raw) : null;
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

/** Returns the same shape (string or object) it was given. */
function withJson(raw: unknown, obj: Record<string, unknown>): unknown {
  return typeof raw === "string" ? JSON.stringify(obj) : obj;
}

export function translateBlockContent(
  block: { id: string; block_type: string; content: string | null },
  map: TMap | null
): string | null {
  if (!map || !block.content) return block.content;
  if (block.block_type === "heading" || block.block_type === "text") {
    return tx(map, "block", block.id, "content", block.content) as string;
  }
  if (block.block_type === "question") {
    const obj = parseJson(block.content);
    if (!obj) return block.content;
    const q = tx(map, "block", block.id, "json:question_text", obj.question_text as string | undefined);
    if (typeof q === "string") obj.question_text = q;
    const e = tx(map, "block", block.id, "json:explanation", obj.explanation as string | undefined);
    if (typeof e === "string") obj.explanation = e;
    if (Array.isArray(obj.options) && obj.question_type !== "short_answer") {
      obj.options = (obj.options as Record<string, unknown>[]).map((o, i) => {
        const oid = typeof o.id === "string" && o.id ? o.id : `opt-${i}`;
        const c = tx(map, "block", block.id, `json:opt:${oid}`, o.content as string | undefined);
        return typeof c === "string" ? { ...o, content: c } : o;
      });
    }
    return withJson(block.content, obj) as string;
  }
  if (block.block_type === "coding_drill") {
    const obj = parseJson(block.content);
    if (!obj) return block.content;
    const d = tx(map, "block", block.id, "json:description", obj.description as string | undefined);
    if (typeof d === "string") obj.description = d;
    return withJson(block.content, obj) as string;
  }
  return block.content;
}

export function translateLessonContent(
  lesson: { id: string; lesson_type: string; content?: unknown },
  map: TMap | null
): unknown {
  if (!map || !lesson.content || lesson.lesson_type !== "coding_drill") {
    return lesson.content;
  }
  const obj = parseJson(lesson.content);
  if (!obj) return lesson.content;
  const d = tx(map, "lesson", lesson.id, "json:description", obj.description as string | undefined);
  if (typeof d === "string") obj.description = d;
  return withJson(lesson.content, obj);
}
