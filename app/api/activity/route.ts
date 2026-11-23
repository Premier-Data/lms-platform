import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONLINE_WINDOW_MS } from "@/lib/activity";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_AGE_MS = 7 * 24 * 3600_000; // ignore stretches claiming to start >7 days ago
const FUTURE_SLACK_MS = 2 * 60_000; // tolerate small clock differences

// POST /api/activity — heartbeat from the signed-in learner's browser.
// body: { segment?: {id, started_at, ended_at, course_id, path}, course_id, path, closing? }
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const now = Date.now();
  const cleanCourse = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);
  const cleanPath = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : null);

  // Time spent reviewing a completed course is not counted towards that course.
  const reviewCache = new Map<string, boolean>();
  const isReview = async (courseId: string | null) => {
    if (!courseId) return false;
    if (!reviewCache.has(courseId)) {
      const { data } = await admin
        .from("course_assignments")
        .select("id")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .eq("status", "completed")
        .limit(1);
      reviewCache.set(courseId, !!data && data.length > 0);
    }
    return reviewCache.get(courseId)!;
  };
  let lastActive: string | null = null;

  const s = body.segment;
  if (s && typeof s === "object" && typeof s.id === "string" && UUID.test(s.id)) {
    const start = Date.parse(s.started_at);
    let end = Date.parse(s.ended_at);
    if (Number.isFinite(start) && Number.isFinite(end) && now - start < MAX_AGE_MS) {
      // Clamp to the server clock; never accept a stretch in the future.
      end = Math.min(end, now + FUTURE_SLACK_MS);
      const startC = Math.min(start, end);
      const row = {
        started_at: new Date(startC).toISOString(),
        ended_at: new Date(end).toISOString(),
        course_id: (await isReview(cleanCourse(s.course_id))) ? null : cleanCourse(s.course_id),
        path: cleanPath(s.path),
      };
      // Update only this user's own row; insert if it's new.
      const { data: updated } = await admin
        .from("activity_segments")
        .update({ ended_at: row.ended_at })
        .eq("id", s.id)
        .eq("user_id", user.id)
        .select("id");
      if (!updated || updated.length === 0) {
        await admin
          .from("activity_segments")
          .insert({ id: s.id, user_id: user.id, ...row });
        // (an id clash with another user's row simply fails to insert)
      }
      lastActive = row.ended_at;
    }
  }

  // Presence
  const presence: Record<string, unknown> = {
    user_id: user.id,
    // A closing tab marks the learner offline straight away; another open tab
    // will bring them back online on its next heartbeat.
    last_seen_at: new Date(body.closing ? now - ONLINE_WINDOW_MS - 1000 : now).toISOString(),
    course_id: (await isReview(cleanCourse(body.course_id))) ? null : cleanCourse(body.course_id),
    path: cleanPath(body.path),
  };
  if (lastActive) presence.last_active_at = lastActive;
  await admin.from("user_presence").upsert(presence, { onConflict: "user_id" });

  return NextResponse.json({ ok: true });
}
