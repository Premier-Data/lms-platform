import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { collectCourseItems } from "@/lib/translations/collect";
import { translateItems, translationConfigured } from "@/lib/translations/translate";
import { hashText, itemKey, type TItem } from "@/lib/translations";

export const maxDuration = 300;

const LOCALE = "vi";
// Items translated per request; the UI calls again until none remain.
const CHUNK = 40;

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  return roles?.some((r) => r.role === "admin" || r.role === "super_admin") ?? false;
}

type Existing = { text: string; source_hash: string; edited: boolean };

async function loadExisting(
  admin: ReturnType<typeof createAdminClient>,
  courseId: string
): Promise<Map<string, Existing>> {
  const map = new Map<string, Existing>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("content_translations")
      .select("entity, entity_id, field, text, source_hash, edited")
      .eq("course_id", courseId)
      .eq("locale", LOCALE)
      .range(from, from + PAGE - 1);
    for (const r of data ?? []) {
      map.set(itemKey(r.entity, r.entity_id, r.field), {
        text: r.text,
        source_hash: r.source_hash,
        edited: r.edited,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return map;
}

type Status = "missing" | "ok" | "outdated";

function statusOf(item: TItem, ex: Existing | undefined): Status {
  if (!ex) return "missing";
  return ex.source_hash === hashText(item.text) ? "ok" : "outdated";
}

// GET /api/admin/translate            -> list of courses with translation status
// GET /api/admin/translate?courseId=  -> every item of one course with its status
export async function GET(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  const courseId = new URL(request.url).searchParams.get("courseId");

  if (courseId) {
    const collected = await collectCourseItems(admin, courseId);
    if (!collected) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    const existing = await loadExisting(admin, courseId);
    const items = collected.items.map((it) => {
      const ex = existing.get(itemKey(it.entity, it.id, it.field));
      return {
        key: itemKey(it.entity, it.id, it.field),
        entity: it.entity,
        id: it.id,
        field: it.field,
        label: it.label,
        html: it.html,
        en: it.text,
        vi: ex?.text ?? null,
        edited: ex?.edited ?? false,
        status: statusOf(it, ex),
      };
    });
    return NextResponse.json({
      configured: translationConfigured(),
      course: { id: courseId, title: collected.title },
      items,
    });
  }

  const { data: courses } = await admin
    .from("courses")
    .select("id, title, status")
    .order("title");
  const out = [];
  for (const c of courses ?? []) {
    const collected = await collectCourseItems(admin, c.id);
    const existing = await loadExisting(admin, c.id);
    const counts = { total: 0, ok: 0, outdated: 0, missing: 0 };
    for (const it of collected?.items ?? []) {
      counts.total++;
      counts[statusOf(it, existing.get(itemKey(it.entity, it.id, it.field)))]++;
    }
    out.push({ id: c.id, title: c.title, status: c.status, ...counts });
  }
  return NextResponse.json({ configured: translationConfigured(), courses: out });
}

// POST { courseId, keys?, force? } -> translate up to CHUNK missing/outdated
// items. Hand-edited items are skipped unless listed in `keys` (or force).
export async function POST(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!translationConfigured()) {
    return NextResponse.json(
      { error: "Automatic translation isn't set up yet (no API key is set)." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const courseId = typeof body.courseId === "string" ? body.courseId : "";
  const keys: string[] | null = Array.isArray(body.keys) ? body.keys : null;
  const force = body.force === true;
  if (!courseId) return NextResponse.json({ error: "courseId is required" }, { status: 400 });

  const admin = createAdminClient();
  const collected = await collectCourseItems(admin, courseId);
  if (!collected) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const existing = await loadExisting(admin, courseId);

  const wanted = collected.items.filter((it) => {
    const k = itemKey(it.entity, it.id, it.field);
    if (keys) return keys.includes(k);
    const ex = existing.get(k);
    const st = statusOf(it, ex);
    if (st === "ok") return force;
    if (ex?.edited && !force) return false; // don't overwrite hand edits
    return true;
  });

  const batch = wanted.slice(0, CHUNK);
  if (batch.length > 0) {
    let translated: string[];
    try {
      translated = await translateItems(batch, LOCALE);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Translation failed." },
        { status: 502 }
      );
    }
    const rows = batch.map((it, i) => ({
      course_id: courseId,
      entity: it.entity,
      entity_id: it.id,
      field: it.field,
      locale: LOCALE,
      text: translated[i],
      source_hash: hashText(it.text),
      edited: false,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin
      .from("content_translations")
      .upsert(rows, { onConflict: "entity,entity_id,field,locale" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    translated: batch.length,
    remaining: Math.max(0, wanted.length - batch.length),
  });
}

// PATCH { courseId, entity, id, field, text } -> save a hand-edited translation
export async function PATCH(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const { courseId, entity, id, field, text } = body as Record<string, string>;
  if (!courseId || !entity || !id || !field || typeof text !== "string") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const collected = await collectCourseItems(admin, courseId);
  const item = collected?.items.find(
    (it) => it.entity === entity && it.id === id && it.field === field
  );
  if (!item) return NextResponse.json({ error: "Item not found in this course" }, { status: 404 });

  if (!text.trim()) {
    // Clearing a translation reverts that string to English.
    await admin
      .from("content_translations")
      .delete()
      .eq("entity", entity)
      .eq("entity_id", id)
      .eq("field", field)
      .eq("locale", LOCALE);
    return NextResponse.json({ ok: true, cleared: true });
  }

  const { error } = await admin.from("content_translations").upsert(
    {
      course_id: courseId,
      entity,
      entity_id: id,
      field,
      locale: LOCALE,
      text,
      source_hash: hashText(item.text),
      edited: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "entity,entity_id,field,locale" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
