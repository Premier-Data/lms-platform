import type { createAdminClient } from "@/lib/supabase/admin";

// Timestamped things a user did (or that happened to them) that are already
// stored elsewhere in the database. These cover dates before live activity
// tracking existed, and keep adding detail alongside it.

export type EventKind =
  | "quiz"
  | "drill"
  | "course_completed"
  | "path_completed"
  | "assigned"
  | "message"
  | "read"
  | "upload"
  | "created_content"
  | "signin"
  | "joined";

export type ActivityEvent = {
  user_id: string;
  kind: EventKind;
  at: string; // ISO
  end?: string; // ISO, for things with a duration (quiz attempts)
  label: string;
  course_id?: string | null;
};

type Admin = ReturnType<typeof createAdminClient>;

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build(off, off + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadEvents(
  admin: Admin,
  from: string,
  to: string,
  userId?: string
): Promise<{ events: ActivityEvent[]; courseTitles: Record<string, string> }> {
  const inRange = (iso: string | null | undefined) => !!iso && iso >= from && iso < to;
  // Limit a query to one user when a user is given.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any, col: string): any => (userId ? q.eq(col, userId) : q);

  const [quizzes, drills, completions, pathDone, assigned, pathAssigned, messages, reads, uploads, createdCourses, createdPaths] =
    await Promise.all([
      all<{ user_id: string; lesson_id: string; started_at: string | null; completed_at: string | null; percentage: number | null; passed: boolean | null }>(
        (a, b) => scope(admin.from("quiz_attempts").select("user_id, lesson_id, started_at, completed_at, percentage, passed"), "user_id").gte("completed_at", from).lt("started_at", to).range(a, b)
      ),
      all<{ user_id: string; block_id: string; accuracy: number | null; created_at: string }>(
        (a, b) => scope(admin.from("coding_drill_attempts").select("user_id, block_id, accuracy, created_at"), "user_id").gte("created_at", from).lt("created_at", to).range(a, b)
      ),
      all<{ user_id: string; course_id: string; completed_at: string }>(
        (a, b) => scope(admin.from("course_assignments").select("user_id, course_id, completed_at"), "user_id").gte("completed_at", from).lt("completed_at", to).range(a, b)
      ),
      all<{ user_id: string; path_id: string; completed_at: string }>(
        (a, b) => scope(admin.from("learning_path_assignments").select("user_id, path_id, completed_at"), "user_id").gte("completed_at", from).lt("completed_at", to).range(a, b)
      ),
      all<{ user_id: string; course_id: string; assigned_at: string }>(
        (a, b) => scope(admin.from("course_assignments").select("user_id, course_id, assigned_at"), "user_id").gte("assigned_at", from).lt("assigned_at", to).range(a, b)
      ),
      all<{ user_id: string; path_id: string; assigned_at: string }>(
        (a, b) => scope(admin.from("learning_path_assignments").select("user_id, path_id, assigned_at"), "user_id").gte("assigned_at", from).lt("assigned_at", to).range(a, b)
      ),
      all<{ sender_id: string; created_at: string; content: string | null; attachment_name: string | null }>(
        (a, b) => scope(admin.from("messages").select("sender_id, created_at, content, attachment_name"), "sender_id").gte("created_at", from).lt("created_at", to).range(a, b)
      ),
      all<{ user_id: string; last_read_at: string | null }>(
        (a, b) => scope(admin.from("conversation_members").select("user_id, last_read_at"), "user_id").gte("last_read_at", from).lt("last_read_at", to).range(a, b)
      ),
      all<{ uploaded_by: string; created_at: string; file_name: string | null }>(
        (a, b) => scope(admin.from("files").select("uploaded_by, created_at, file_name"), "uploaded_by").gte("created_at", from).lt("created_at", to).range(a, b)
      ),
      all<{ created_by: string; created_at: string; title: string }>(
        (a, b) => scope(admin.from("courses").select("created_by, created_at, title"), "created_by").gte("created_at", from).lt("created_at", to).range(a, b)
      ),
      all<{ created_by: string; created_at: string; title: string }>(
        (a, b) => scope(admin.from("learning_paths").select("created_by, created_at, title"), "created_by").gte("created_at", from).lt("created_at", to).range(a, b)
      ),
    ]);

  // Names for lessons / courses / paths referenced
  const lessonIds = [...new Set([...quizzes.map((q) => q.lesson_id), ...drills.map((d) => d.block_id)])];
  const lessonInfo = new Map<string, { title: string; course_id: string | null }>();
  if (lessonIds.length) {
    const lessons = await all<{ id: string; title: string; module_id: string }>((a, b) =>
      admin.from("lessons").select("id, title, module_id").in("id", lessonIds).range(a, b)
    );
    const moduleIds = [...new Set(lessons.map((l) => l.module_id))];
    const modules = moduleIds.length
      ? await all<{ id: string; course_id: string }>((a, b) => admin.from("modules").select("id, course_id").in("id", moduleIds).range(a, b))
      : [];
    const courseOfModule = new Map(modules.map((m) => [m.id, m.course_id]));
    for (const l of lessons) lessonInfo.set(l.id, { title: l.title, course_id: courseOfModule.get(l.module_id) ?? null });
  }
  const courseIds = [
    ...new Set(
      [
        ...completions.map((c) => c.course_id),
        ...assigned.map((c) => c.course_id),
        ...[...lessonInfo.values()].map((l) => l.course_id),
      ].filter(Boolean) as string[]
    ),
  ];
  const courseTitles: Record<string, string> = {};
  if (courseIds.length) {
    const cs = await all<{ id: string; title: string }>((a, b) => admin.from("courses").select("id, title").in("id", courseIds).range(a, b));
    for (const c of cs) courseTitles[c.id] = c.title;
  }
  const pathIds = [...new Set([...pathDone.map((p) => p.path_id), ...pathAssigned.map((p) => p.path_id)])];
  const pathTitles: Record<string, string> = {};
  if (pathIds.length) {
    const ps = await all<{ id: string; title: string }>((a, b) => admin.from("learning_paths").select("id, title").in("id", pathIds).range(a, b));
    for (const p of ps) pathTitles[p.id] = p.title;
  }

  const events: ActivityEvent[] = [];
  for (const q of quizzes) {
    const start = q.started_at ?? q.completed_at;
    if (!start) continue;
    const info = lessonInfo.get(q.lesson_id);
    events.push({
      user_id: q.user_id,
      kind: "quiz",
      at: start,
      end: q.completed_at ?? undefined,
      course_id: info?.course_id ?? null,
      label: `Quiz "${info?.title ?? "quiz"}" · ${q.percentage ?? 0}%${q.passed ? " (passed)" : ""}`,
    });
  }
  for (const d of drills) {
    const info = lessonInfo.get(d.block_id);
    events.push({
      user_id: d.user_id,
      kind: "drill",
      at: d.created_at,
      course_id: info?.course_id ?? null,
      label: `Coding drill${info ? ` "${info.title}"` : ""} submitted · ${d.accuracy ?? 0}%`,
    });
  }
  for (const c of completions)
    events.push({ user_id: c.user_id, kind: "course_completed", at: c.completed_at, course_id: c.course_id, label: `Completed course "${courseTitles[c.course_id] ?? "course"}"` });
  for (const p of pathDone)
    events.push({ user_id: p.user_id, kind: "path_completed", at: p.completed_at, label: `Completed learning path "${pathTitles[p.path_id] ?? "path"}"` });
  for (const c of assigned)
    events.push({ user_id: c.user_id, kind: "assigned", at: c.assigned_at, course_id: c.course_id, label: `Assigned course "${courseTitles[c.course_id] ?? "course"}"` });
  for (const p of pathAssigned)
    events.push({ user_id: p.user_id, kind: "assigned", at: p.assigned_at, label: `Assigned learning path "${pathTitles[p.path_id] ?? "path"}"` });
  for (const m of messages)
    events.push({
      user_id: m.sender_id,
      kind: "message",
      at: m.created_at,
      label: m.attachment_name ? `Sent a file in chat (${m.attachment_name})` : "Sent a chat message",
    });
  for (const r of reads) if (r.last_read_at) events.push({ user_id: r.user_id, kind: "read", at: r.last_read_at, label: "Read messages" });
  for (const f of uploads)
    events.push({ user_id: f.uploaded_by, kind: "upload", at: f.created_at, label: `Uploaded "${f.file_name ?? "file"}"` });
  for (const c of createdCourses) events.push({ user_id: c.created_by, kind: "created_content", at: c.created_at, label: `Created course "${c.title}"` });
  for (const p of createdPaths) events.push({ user_id: p.created_by, kind: "created_content", at: p.created_at, label: `Created learning path "${p.title}"` });

  // Account events (only the latest sign-in is kept by Supabase)
  if (userId) {
    const { data } = await admin.auth.admin.getUserById(userId);
    const u = data?.user;
    if (u && inRange(u.created_at)) events.push({ user_id: userId, kind: "joined", at: u.created_at, label: "Account created" });
    if (u && inRange(u.last_sign_in_at)) events.push({ user_id: userId, kind: "signin", at: u.last_sign_in_at!, label: "Signed in (most recent sign-in)" });
  } else {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data) break;
      for (const u of data.users) {
        if (inRange(u.created_at)) events.push({ user_id: u.id, kind: "joined", at: u.created_at, label: "Account created" });
        if (inRange(u.last_sign_in_at)) events.push({ user_id: u.id, kind: "signin", at: u.last_sign_in_at!, label: "Signed in (most recent sign-in)" });
      }
      if (data.users.length < 1000) break;
    }
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  return { events: events.filter((e) => e.user_id), courseTitles };
}

/** Things the user actually did themselves (excludes being assigned, etc.). */
export const SELF_ACTIONS: EventKind[] = [
  "quiz",
  "drill",
  "course_completed",
  "path_completed",
  "message",
  "read",
  "upload",
  "created_content",
  "signin",
];
