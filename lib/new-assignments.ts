import type { User } from "@supabase/supabase-js";
import { fetchCourseTitleMap, tx } from "@/lib/translations";

// Works out which courses / learning paths a learner has been given since they
// last dismissed the "you've been assigned" pop-up. The "last seen" time lives
// in the user's auth metadata (assignments_seen_at), so no table is needed.

export type NewAssignment = {
  kind: "course" | "path";
  id: string;
  title: string;
  /** where "Start" takes the learner */
  href: string;
  courseCount?: number;
  dueDate?: string | null;
};

export const SEEN_KEY = "assignments_seen_at";
// First time the pop-up runs for someone, only show recent assignments so
// long-standing learners aren't shown everything they've ever been given.
const FIRST_RUN_LOOKBACK_DAYS = 7;

export async function getNewAssignments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  user: User,
  locale: string
): Promise<NewAssignment[]> {
  const seenRaw = user.user_metadata?.[SEEN_KEY];
  const cutoff =
    typeof seenRaw === "string" && !Number.isNaN(Date.parse(seenRaw))
      ? seenRaw
      : new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 864e5).toISOString();

  // All of this learner's paths (to know which courses belong to a path).
  const { data: allPathRows } = await supabase
    .from("learning_path_assignments")
    .select("path_id, assigned_at")
    .eq("user_id", user.id);
  const allPathIds: string[] = (allPathRows ?? []).map(
    (r: { path_id: string }) => r.path_id
  );
  const newPathIds = (allPathRows ?? [])
    .filter((r: { assigned_at: string | null }) => r.assigned_at && r.assigned_at > cutoff)
    .map((r: { path_id: string }) => r.path_id);

  const { data: pathCourses } =
    allPathIds.length > 0
      ? await supabase
          .from("learning_path_courses")
          .select("path_id, course_id, position")
          .in("path_id", allPathIds)
          .order("position", { ascending: true })
      : { data: [] };
  const coursesInPaths = new Set<string>(
    (pathCourses ?? []).map((pc: { course_id: string }) => pc.course_id)
  );

  // Newly assigned standalone courses (path courses are shown as the path).
  const { data: newCourseRows } = await supabase
    .from("course_assignments")
    .select("course_id, due_date, status, assigned_at, courses ( id, title, status )")
    .eq("user_id", user.id)
    .gt("assigned_at", cutoff);

  const items: NewAssignment[] = [];

  if (newPathIds.length > 0) {
    const { data: paths } = await supabase
      .from("learning_paths")
      .select("id, title")
      .in("id", newPathIds);
    for (const p of paths ?? []) {
      const ordered = (pathCourses ?? []).filter(
        (pc: { path_id: string }) => pc.path_id === p.id
      );
      items.push({
        kind: "path",
        id: p.id,
        title: p.title,
        href: ordered[0] ? `/courses/${ordered[0].course_id}` : "/courses",
        courseCount: ordered.length,
      });
    }
  }

  const courseItems: NewAssignment[] = [];
  for (const r of newCourseRows ?? []) {
    const c = Array.isArray(r.courses) ? r.courses[0] : r.courses;
    if (!c || c.status !== "published") continue;
    if (r.status === "completed") continue;
    if (coursesInPaths.has(r.course_id)) continue;
    courseItems.push({
      kind: "course",
      id: c.id,
      title: c.title,
      href: `/courses/${c.id}`,
      dueDate: r.due_date ?? null,
    });
  }

  // Vietnamese course titles where translated.
  const tmap = await fetchCourseTitleMap(
    supabase,
    courseItems.map((c) => c.id),
    locale
  );
  for (const c of courseItems) {
    c.title = tx(tmap, "course", c.id, "title", c.title) as string;
  }

  return [...items, ...courseItems];
}
