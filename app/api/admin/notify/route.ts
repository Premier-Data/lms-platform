import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildEmail,
  FROM,
  SITE_URL,
  type NotificationTemplate,
} from "@/lib/notifications";
import { createNotifications } from "@/lib/create-notification";

const TEMPLATES: NotificationTemplate[] = ["new_course", "reminder", "due_soon", "custom"];

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

type Admin = ReturnType<typeof createAdminClient>;

type Recipient = {
  user_id: string;
  status: "not_started" | "in_progress" | "completed";
  progress?: string; // e.g. "3/11" for paths
  due_date?: string | null;
};

type Target = {
  kind: "course" | "path";
  title: string;
  link: string;
  courseCount?: number;
  recipients: Recipient[];
};

/** Who is assigned to the course / path, with where they're up to. */
async function loadTarget(
  admin: Admin,
  courseId: string | null,
  pathId: string | null
): Promise<Target | null> {
  if (courseId) {
    const { data: course } = await admin
      .from("courses")
      .select("title")
      .eq("id", courseId)
      .maybeSingle();
    if (!course) return null;
    const { data: rows } = await admin
      .from("course_assignments")
      .select("user_id, status, due_date")
      .eq("course_id", courseId);
    return {
      kind: "course",
      title: course.title,
      link: `/courses/${courseId}`,
      recipients: (rows ?? []).map((r) => ({
        user_id: r.user_id,
        status: (r.status ?? "not_started") as Recipient["status"],
        due_date: r.due_date,
      })),
    };
  }

  if (pathId) {
    const { data: path } = await admin
      .from("learning_paths")
      .select("title")
      .eq("id", pathId)
      .maybeSingle();
    if (!path) return null;
    const { data: pcs } = await admin
      .from("learning_path_courses")
      .select("course_id, position")
      .eq("path_id", pathId)
      .order("position", { ascending: true });
    const courseIds = (pcs ?? []).map((p) => p.course_id as string);
    const { data: pas } = await admin
      .from("learning_path_assignments")
      .select("user_id")
      .eq("path_id", pathId);
    const userIds = (pas ?? []).map((p) => p.user_id as string);

    const done = new Map<string, number>();
    const started = new Set<string>();
    if (courseIds.length && userIds.length) {
      const { data: cas } = await admin
        .from("course_assignments")
        .select("user_id, status")
        .in("course_id", courseIds)
        .in("user_id", userIds);
      for (const c of cas ?? []) {
        if (c.status === "completed") done.set(c.user_id, (done.get(c.user_id) ?? 0) + 1);
        if (c.status && c.status !== "not_started") started.add(c.user_id);
      }
    }
    return {
      kind: "path",
      title: path.title,
      link: courseIds[0] ? `/courses/${courseIds[0]}` : "/courses",
      courseCount: courseIds.length,
      recipients: userIds.map((id) => {
        const d = done.get(id) ?? 0;
        return {
          user_id: id,
          status:
            courseIds.length > 0 && d >= courseIds.length
              ? "completed"
              : started.has(id)
                ? "in_progress"
                : "not_started",
          progress: `${d}/${courseIds.length}`,
        };
      }),
    };
  }
  return null;
}

// GET /api/admin/notify?course_id=… | ?path_id=…  -> assigned learners + status
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = new URL(request.url).searchParams;
  const target = await loadTarget(createAdminClient(), sp.get("course_id"), sp.get("path_id"));
  if (!target) {
    return NextResponse.json({ error: "Course or learning path not found" }, { status: 404 });
  }
  return NextResponse.json({
    kind: target.kind,
    title: target.title,
    recipients: target.recipients,
    email_configured: !!process.env.RESEND_API_KEY,
  });
}

// POST /api/admin/notify — e-mail (and bell-notify) assigned learners.
// body: { user_ids, template, course_id? | path_id?, custom_subject?, custom_message? }
// Only learners actually assigned to the course / path are contacted.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { user_ids, template, course_id, path_id, custom_subject, custom_message } =
    body as {
      user_ids?: string[];
      template?: NotificationTemplate;
      course_id?: string;
      path_id?: string;
      custom_subject?: string;
      custom_message?: string;
    };

  if (!Array.isArray(user_ids) || user_ids.length === 0 || !template || !TEMPLATES.includes(template)) {
    return NextResponse.json({ error: "user_ids and a valid template are required" }, { status: 400 });
  }
  if (template === "custom" && !(custom_message ?? "").trim()) {
    return NextResponse.json({ error: "Write a message for the custom e-mail." }, { status: 400 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "E-mail isn't set up (RESEND_API_KEY missing)." }, { status: 503 });
  }

  const admin = createAdminClient();
  const target = await loadTarget(admin, course_id ?? null, path_id ?? null);
  if (!target) {
    return NextResponse.json({ error: "Course or learning path not found" }, { status: 404 });
  }

  const byUser = new Map(target.recipients.map((r) => [r.user_id, r]));
  const ids = [...new Set(user_ids)].filter((id) => byUser.has(id));
  const notAssigned = user_ids.length - ids.length;

  // E-mail addresses + names
  const wanted = new Set(ids);
  const emails = new Map<string, string>();
  const metaNames = new Map<string, string>();
  for (let page = 1; page <= 20 && emails.size < wanted.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      if (!wanted.has(u.id) || !u.email) continue;
      emails.set(u.id, u.email);
      if (typeof u.user_metadata?.full_name === "string") metaNames.set(u.id, u.user_metadata.full_name);
    }
    if (data.users.length < 1000) break;
  }
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) ?? ""]));

  const ctaUrl = `${SITE_URL}${target.link}`;
  const messages = ids
    .filter((id) => emails.has(id))
    .map((id) => {
      const { subject, html } = buildEmail(template, {
        fullName: names.get(id) || metaNames.get(id) || "",
        courseTitle: target.title,
        kind: target.kind,
        courseCount: target.courseCount,
        dueDate: byUser.get(id)?.due_date ?? null,
        customSubject: custom_subject,
        customMessage: custom_message,
        ctaUrl,
      });
      return { id, msg: { from: FROM, to: emails.get(id)!, subject, html } };
    });

  // Batched (100 per call) so bulk sends aren't rate limited.
  const resend = new Resend(process.env.RESEND_API_KEY);
  const sentIds: string[] = [];
  let lastError: string | null = null;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const { error } = await resend.batch.send(chunk.map((m) => m.msg));
      if (error) lastError = error.message;
      else sentIds.push(...chunk.map((m) => m.id));
    } catch (e) {
      lastError = e instanceof Error ? e.message : "E-mail failed.";
    }
  }

  // Bell notification for everyone e-mailed
  const noun = target.kind === "path" ? "learning path" : "course";
  const bellTitle: Record<NotificationTemplate, string> = {
    new_course: target.kind === "path" ? "New learning path assigned" : "New course assigned",
    reminder: `Reminder: ${target.title}`,
    due_soon: `${target.title} is due soon`,
    custom: custom_subject || "New message",
  };
  const bellMessage: Record<NotificationTemplate, string> = {
    new_course: `You've been assigned: ${target.title}`,
    reminder: `Reminder to finish your ${noun}: ${target.title}`,
    due_soon: `Please complete ${target.title} before it's due`,
    custom: custom_message || "",
  };
  await createNotifications(
    sentIds.map((id) => ({
      userId: id,
      title: bellTitle[template],
      message: bellMessage[template],
      link: target.link,
    }))
  ).catch(() => {});

  return NextResponse.json({
    sent: sentIds.length,
    failed: ids.length - sentIds.length,
    not_assigned: notAssigned,
    error: lastError,
  });
}
