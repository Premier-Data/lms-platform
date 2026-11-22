import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergedLength, presenceStatus } from "@/lib/activity";

async function isAdmin() {
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

type SegRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  course_id: string | null;
};

async function loadSegments(
  admin: ReturnType<typeof createAdminClient>,
  from: string,
  to: string,
  userId?: string
): Promise<SegRow[]> {
  const out: SegRow[] = [];
  for (let off = 0; ; off += 1000) {
    let q = admin
      .from("activity_segments")
      .select("id, user_id, started_at, ended_at, course_id")
      .lt("started_at", to)
      .gt("ended_at", from)
      .order("started_at", { ascending: true })
      .range(off, off + 999);
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as SegRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// GET /api/admin/activity?from=ISO&to=ISO              -> every user, summary
// GET /api/admin/activity?user_id=…&from=ISO&to=ISO    -> one user's stretches
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const userId = sp.get("user_id");
  if (!from || !to || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    return NextResponse.json({ error: "from and to (ISO dates) are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  let segments: SegRow[];
  try {
    segments = await loadSegments(admin, from, to, userId ?? undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Query failed";
    const missing = /activity_segments|does not exist|schema cache/i.test(msg);
    return NextResponse.json(
      { error: missing ? "Activity tracking tables are not set up yet (run 006_activity_tracking.sql)." : msg },
      { status: missing ? 503 : 500 }
    );
  }

  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const clip = (s: SegRow) => ({
    start: Math.max(Date.parse(s.started_at), fromMs),
    end: Math.min(Date.parse(s.ended_at), toMs),
  });

  // Course titles for anything referenced
  const courseIds = [...new Set(segments.map((s) => s.course_id).filter(Boolean))] as string[];
  const { data: courses } = courseIds.length
    ? await admin.from("courses").select("id, title").in("id", courseIds)
    : { data: [] };
  const courseTitles = Object.fromEntries((courses ?? []).map((c) => [c.id, c.title]));

  if (userId) {
    const { data: presence } = await admin
      .from("user_presence")
      .select("last_seen_at, last_active_at, course_id, path")
      .eq("user_id", userId)
      .maybeSingle();

    // Time per course in the range
    const perCourse = new Map<string, { start: number; end: number }[]>();
    for (const s of segments) {
      const key = s.course_id ?? "";
      const list = perCourse.get(key) ?? [];
      list.push(clip(s));
      perCourse.set(key, list);
    }
    return NextResponse.json({
      segments: segments.map((s) => ({
        id: s.id,
        started_at: s.started_at,
        ended_at: s.ended_at,
        course_id: s.course_id,
      })),
      courses: courseTitles,
      per_course: [...perCourse.entries()]
        .map(([cid, parts]) => ({
          course_id: cid || null,
          title: cid ? courseTitles[cid] ?? "Deleted course" : "Outside courses (dashboard, messages…)",
          ms: mergedLength(parts),
        }))
        .sort((a, b) => b.ms - a.ms),
      presence: presence
        ? {
            ...presence,
            status: presenceStatus(presence.last_seen_at, presence.last_active_at),
            course_title: presence.course_id ? courseTitles[presence.course_id] ?? null : null,
          }
        : { status: "offline" },
    });
  }

  // Summary for everyone
  const { data: presences } = await admin
    .from("user_presence")
    .select("user_id, last_seen_at, last_active_at, course_id");
  const presenceCourseIds = (presences ?? [])
    .map((p) => p.course_id)
    .filter((c): c is string => !!c && !courseTitles[c]);
  if (presenceCourseIds.length) {
    const { data: more } = await admin.from("courses").select("id, title").in("id", presenceCourseIds);
    for (const c of more ?? []) courseTitles[c.id] = c.title;
  }

  const byUser = new Map<string, SegRow[]>();
  for (const s of segments) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }
  const ids = new Set<string>([...byUser.keys(), ...(presences ?? []).map((p) => p.user_id)]);
  const presenceById = new Map((presences ?? []).map((p) => [p.user_id, p]));

  const users = [...ids].map((id) => {
    const segs = byUser.get(id) ?? [];
    const parts = segs.map(clip);
    const p = presenceById.get(id);
    return {
      user_id: id,
      worked_ms: mergedLength(parts),
      first_active: parts.length ? new Date(Math.min(...parts.map((x) => x.start))).toISOString() : null,
      last_active: parts.length ? new Date(Math.max(...parts.map((x) => x.end))).toISOString() : null,
      status: presenceStatus(p?.last_seen_at, p?.last_active_at),
      last_seen_at: p?.last_seen_at ?? null,
      last_active_at: p?.last_active_at ?? null,
      current_course: p?.course_id ? courseTitles[p.course_id] ?? null : null,
    };
  });

  return NextResponse.json({ users });
}
