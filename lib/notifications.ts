import { Resend } from "resend";

// E-mail templates for admin-triggered notifications (Notify button) on a
// course or a learning path, plus system e-mails (e.g. password reset).

export const FROM = "Premier Data Training <noreply@premierdata-technology.com>";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://training.premierdata-technology.com";

export type NotificationTemplate =
  | "new_course" // "you've been assigned …" (works for courses and paths)
  | "reminder"
  | "due_soon"
  | "custom";

export type TemplateData = {
  fullName: string;
  /** course or learning path title */
  courseTitle: string;
  kind?: "course" | "path";
  courseCount?: number;
  dueDate?: string | null;
  customSubject?: string;
  customMessage?: string;
  /** trusted HTML body for system e-mails (never pass user input here) */
  customHtml?: string;
  /** where the button goes (defaults to My Courses) */
  ctaUrl?: string;
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function layout(heading: string | null, body: string, cta: string, url: string) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #0a1830; border-radius: 16px; overflow: hidden;">
      <div style="background: #061020; padding: 24px 32px;">
        <span style="font-size: 20px; font-weight: 800; color: #ffffff;">PREMIER<span style="color:#e11b2d;">DATA</span></span>
      </div>
      <div style="padding: 32px; color: #e2e8f0;">
        ${heading ? `<h1 style="margin: 0 0 16px; font-size: 22px; color: #ffffff;">${heading}</h1>` : ""}
        <div style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">${body}</div>
        <div style="margin-top: 28px;">
          <a href="${url}" style="display: inline-block; background: #e11b2d; color: #ffffff; text-decoration: none; font-weight: 600; padding: 12px 24px; border-radius: 10px;">${cta}</a>
        </div>
      </div>
      <div style="padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #64748b;">
        Premier Data Training &middot; Building skills. Driving results.
      </div>
    </div>`;
}

// Builds the subject + HTML body for each notification template.
export function buildEmail(
  template: NotificationTemplate,
  data: TemplateData
): { subject: string; html: string } {
  const name = esc(data.fullName || "there");
  const title = esc(data.courseTitle);
  const strong = `<strong style="color:#ffffff;">${title}</strong>`;
  const isPath = data.kind === "path";
  const noun = isPath ? "learning path" : "course";
  const url = data.ctaUrl ?? `${SITE_URL}/courses`;
  const due = data.dueDate
    ? new Date(data.dueDate).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  switch (template) {
    case "new_course": {
      const extra =
        isPath && data.courseCount
          ? ` (${data.courseCount} course${data.courseCount === 1 ? "" : "s"}, completed in order)`
          : "";
      const heading = `You've been assigned a ${noun}`;
      return {
        subject: `${isPath ? "Learning path" : "Course"} assigned: ${data.courseTitle}`,
        html: layout(
          heading,
          `Hi ${name},<br/><br/>You've been assigned the ${noun} ${strong}${extra}.${
            due ? `<br/><br/>Please complete it by <strong style="color:#ffffff;">${due}</strong>.` : ""
          }<br/><br/>Log in to get started.`,
          isPath ? "Start learning path" : "Start course",
          url
        ),
      };
    }

    case "reminder":
      return {
        subject: `Reminder: ${data.courseTitle}`,
        html: layout(
          "Reminder: finish your training",
          `Hi ${name},<br/><br/>This is a friendly reminder to complete your ${noun}: ${strong}.<br/><br/>Pick up where you left off.`,
          "Continue",
          url
        ),
      };

    case "due_soon":
      return {
        subject: `Due soon: ${data.courseTitle}`,
        html: layout(
          `Your ${noun} is due soon`,
          `Hi ${name},<br/><br/>Your ${noun} ${strong} is due${
            due ? ` by <strong style="color:#ffffff;">${due}</strong>` : " soon"
          }.<br/><br/>Please complete it before the deadline.`,
          "Complete now",
          url
        ),
      };

    case "custom":
      return {
        subject: data.customSubject || "A message from Premier Data Training",
        html: layout(
          null,
          `Hi ${name},<br/><br/>${
            data.customHtml ??
            esc(data.customMessage || "").replace(/\n/g, "<br/>")
          }`,
          isPath ? "Go to learning path" : "Go to course",
          url
        ),
      };
  }
}

// Sends a single notification e-mail via Resend.
export async function sendNotification(
  to: string,
  template: NotificationTemplate,
  data: TemplateData
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  const resend = new Resend(apiKey);
  const { subject, html } = buildEmail(template, data);
  return resend.emails.send({ from: FROM, to, subject, html });
}
