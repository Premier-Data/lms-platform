import type { SupabaseClient } from "@supabase/supabase-js";
import type { TItem } from "@/lib/translations";

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

const has = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;

/**
 * Walk one course and list every string that should have a Vietnamese copy.
 * Course text that is not language (URLs, ids, grading answers for short-answer
 * questions) is deliberately left out.
 */
export async function collectCourseItems(
  admin: SupabaseClient,
  courseId: string
): Promise<{ title: string; items: TItem[] } | null> {
  const { data: course } = await admin
    .from("courses")
    .select("id, title, description")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return null;

  const items: TItem[] = [];
  const add = (
    entity: TItem["entity"],
    id: string,
    field: string,
    text: unknown,
    label: string,
    html = false
  ) => {
    if (has(text)) items.push({ entity, id, field, text, html, label });
  };

  add("course", course.id, "title", course.title, "Course title");
  add("course", course.id, "description", course.description, "Course description");

  const { data: modules } = await admin
    .from("modules")
    .select("id, title, position")
    .eq("course_id", courseId)
    .order("position");
  const moduleIds = (modules ?? []).map((m) => m.id);
  const moduleName = new Map<string, string>();
  (modules ?? []).forEach((m, i) => {
    moduleName.set(m.id, `Module ${i + 1}`);
    add("module", m.id, "title", m.title, `Module ${i + 1} title`);
  });
  if (moduleIds.length === 0) return { title: course.title, items };

  const { data: lessons } = await admin
    .from("lessons")
    .select("id, module_id, title, lesson_type, content, position")
    .in("module_id", moduleIds)
    .order("position");
  const lessonLabel = new Map<string, string>();
  for (const l of lessons ?? []) {
    const where = `${moduleName.get(l.module_id) ?? "Module"} › ${l.title}`;
    lessonLabel.set(l.id, where);
    add("lesson", l.id, "title", l.title, `${where} (lesson title)`);
    if (l.lesson_type === "coding_drill") {
      const cfg = parseJson(l.content);
      add("lesson", l.id, "json:description", cfg?.description, `${where} (drill instructions)`);
    }
  }
  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length === 0) return { title: course.title, items };

  // Pages + blocks
  const { data: pages } = await admin
    .from("lesson_pages")
    .select("id, lesson_id, title, position")
    .in("lesson_id", lessonIds)
    .order("position");
  const pageLabel = new Map<string, string>();
  for (const p of pages ?? []) {
    const where = `${lessonLabel.get(p.lesson_id) ?? "Lesson"} › ${p.title || `Page ${p.position + 1}`}`;
    pageLabel.set(p.id, where);
    add("page", p.id, "title", p.title, `${where} (page title)`);
  }
  const pageIds = (pages ?? []).map((p) => p.id);
  if (pageIds.length > 0) {
    const { data: blocks } = await admin
      .from("lesson_blocks")
      .select("id, page_id, block_type, content, position")
      .in("page_id", pageIds)
      .order("position");
    for (const b of blocks ?? []) {
      const where = pageLabel.get(b.page_id) ?? "Page";
      if (b.block_type === "heading") {
        add("block", b.id, "content", b.content, `${where} › heading`);
      } else if (b.block_type === "text") {
        add("block", b.id, "content", b.content, `${where} › text`, true);
      } else if (b.block_type === "question") {
        const q = parseJson(b.content);
        if (!q) continue;
        add("block", b.id, "json:question_text", q.question_text, `${where} › question`);
        add("block", b.id, "json:explanation", q.explanation, `${where} › question explanation`);
        if (q.question_type !== "short_answer" && Array.isArray(q.options)) {
          (q.options as Record<string, unknown>[]).forEach((o, i) => {
            const oid = typeof o.id === "string" && o.id ? o.id : `opt-${i}`;
            add("block", b.id, `json:opt:${oid}`, o.content, `${where} › question option ${i + 1}`);
          });
        }
      } else if (b.block_type === "coding_drill") {
        const d = parseJson(b.content);
        add("block", b.id, "json:description", d?.description, `${where} › drill instructions`);
      }
    }
  }

  // Quizzes
  const { data: questions } = await admin
    .from("quiz_questions")
    .select("id, lesson_id, position, question_text, question_type, explanation, quiz_options(id, content, position)")
    .in("lesson_id", lessonIds)
    .order("position");
  for (const q of questions ?? []) {
    const where = `${lessonLabel.get(q.lesson_id) ?? "Quiz"} › Q${q.position + 1}`;
    add("quiz_question", q.id, "question_text", q.question_text, `${where} question`);
    add("quiz_question", q.id, "explanation", q.explanation, `${where} explanation`);
    if (q.question_type !== "short_answer") {
      const opts = ((q.quiz_options ?? []) as { id: string; content: string; position: number }[])
        .sort((a, b) => a.position - b.position);
      opts.forEach((o, i) => add("quiz_option", o.id, "content", o.content, `${where} option ${i + 1}`));
    }
  }

  const { data: configs } = await admin
    .from("quiz_config")
    .select("id, lesson_id, intro_title, intro_message, end_title, end_message")
    .in("lesson_id", lessonIds);
  for (const c of configs ?? []) {
    const where = lessonLabel.get(c.lesson_id) ?? "Quiz";
    add("quiz_config", c.id, "intro_title", c.intro_title, `${where} › intro title`);
    add("quiz_config", c.id, "intro_message", c.intro_message, `${where} › intro message`);
    add("quiz_config", c.id, "end_title", c.end_title, `${where} › end title`);
    add("quiz_config", c.id, "end_message", c.end_message, `${where} › end message`);
  }

  return { title: course.title, items };
}
