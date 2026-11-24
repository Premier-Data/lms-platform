/**
 * Marks a course as edited so a published course goes back to draft.
 * Best effort: never throws. Returns true when the course was unpublished by this call.
 */
export async function markCourseEdited(body: {
  course_id?: string;
  lesson_id?: string;
  module_id?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/admin/unpublish-on-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.unpublished === true;
  } catch {
    return false;
  }
}

export const UNPUBLISHED_NOTICE =
  "This course was published. Your change set it back to draft. Republish it from the course page when you're done.";
