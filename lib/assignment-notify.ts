import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotifications } from "@/lib/create-notification";

// Tells learners they've been given a course or learning path:
//  - an e-mail (via Resend, batched so bulk assignments aren't rate limited)
//  - an in-app notification (bell)
// The login pop-up is driven by the assignment rows themselves (see
// lib/new-assignments.ts), so nothing extra is stored for it.

const FROM = "Premier Data Training <noreply@premierdata-technology.com>";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://training.premierdata-technology.com";

export type AssignmentKind = "course" | "path";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function buildAssignmentEmail(opts: {
  fullName: string;
  kind: AssignmentKind;
  title: string;
  courseCount?: number;
  dueDate?: string | null;
  url: string;
}) {
  const name = esc(opts.fullName || "there");
  const title = esc(opts.title);
  const isPath = opts.kind === "path";
  const subject = isPath
    ? `New learning path assigned: ${opts.title}`
    : `New course assigned: ${opts.title}`;
  const what = isPath
    ? `a new learning path: <strong style="color:#ffffff;">${title}</strong>${
        opts.courseCount
          ? ` (${opts.courseCount} course${opts.courseCount === 1 ? "" : "s"}, completed in order)`
          : ""
      }`
    : `a new course: <strong style="color:#ffffff;">${title}</strong>`;
  const due = opts.dueDate
    ? `<br/><br/>Please complete it by <strong style="color:#ffffff;">${new Date(
        opts.dueDate
      ).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</strong>.`
    : "";
  const cta = isPath ? "Start learning path" : "Start course";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0a1830; border-radius: 16px; overflow: hidden;">
      <div style="background: #061020; padding: 24px 32px;">
        <span style="font-size: 20px; font-weight: 800; color: #ffffff;">PREMIER<span style="color:#e11b2d;">DATA</span></span>
      </div>
      <div style="padding: 32px; color: #e2e8f0;">
        <h1 style="margin: 0 0 16px; font-size: 22px; color: #ffffff;">${
          isPath ? "You've been assigned a learning path" : "You've been assigned a course"
        }</h1>
        <div style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          Hi ${name},<br/><br/>You've been assigned ${what}.${due}<br/><br/>Log in to get started.
        </div>
        <div style="margin-top: 28px;">
          <a href="${opts.url}" style="display: inline-block; background: #e11b2d; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 10px;">${cta}</a>
        </div>
      </div>
      <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b;">
        Premier Data Training &middot; Building skills. Driving results.
      </div>
    </div>`;
  return { subject, html };
}

/**
 * Notify newly assigned learners. Never throws: assignment has already
 * happened, so a mail problem is reported back rather than failing the call.
 */
export async function notifyAssigned(opts: {
  userIds: string[];
  kind: AssignmentKind;
  title: string;
  /** in-app path, e.g. /courses/<id> */
  link: string;
  courseCount?: number;
  dueDate?: string | null;
}): Promise<{ emailed: number; emailError: string | null }> {
  const userIds = [...new Set(opts.userIds)];
  if (userIds.length === 0) return { emailed: 0, emailError: null };

  const admin = createAdminClient();

  // In-app notification (bell)
  try {
    await createNotifications(
      userIds.map((id) => ({
        userId: id,
        title:
          opts.kind === "path"
            ? "New learning path assigned"
            : "New course assigned",
        message: `You've been assigned: ${opts.title}`,
        link: opts.link,
      }))
    );
  } catch {
    // non-fatal
  }

  // E-mail
  if (!process.env.RESEND_API_KEY) {
    return { emailed: 0, emailError: "RESEND_API_KEY is not configured." };
  }

  const wanted = new Set(userIds);
  const emails = new Map<string, string>();
  for (let page = 1; page <= 20 && emails.size < wanted.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data) break;
    for (const u of data.users) {
      if (wanted.has(u.id) && u.email) emails.set(u.id, u.email);
    }
    if (data.users.length < 1000) break;
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  const names = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.full_name as string) ?? ""])
  );

  const url = `${SITE_URL}${opts.link}`;
  const messages = userIds
    .filter((id) => emails.has(id))
    .map((id) => {
      const { subject, html } = buildAssignmentEmail({
        fullName: names.get(id) ?? "",
        kind: opts.kind,
        title: opts.title,
        courseCount: opts.courseCount,
        dueDate: opts.dueDate,
        url,
      });
      return { from: FROM, to: emails.get(id)!, subject, html };
    });

  const resend = new Resend(process.env.RESEND_API_KEY);
  let emailed = 0;
  let emailError: string | null = null;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const { error } = await resend.batch.send(chunk);
      if (error) emailError = error.message;
      else emailed += chunk.length;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Email failed.";
    }
  }
  return { emailed, emailError };
}
