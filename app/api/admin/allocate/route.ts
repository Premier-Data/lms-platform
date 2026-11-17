import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAssigned } from "@/lib/assignment-notify";

// GET /api/admin/allocate?course_id=... — list user_ids already assigned to a course
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin = roles?.some(
    (r) => r.role === "admin" || r.role === "super_admin"
  );

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("course_id");

  if (!courseId) {
    return NextResponse.json({ error: "course_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("course_assignments")
    .select("user_id")
    .eq("course_id", courseId);

  return NextResponse.json({
    user_ids: (data ?? []).map((r) => r.user_id),
  });
}

// POST /api/admin/allocate — assign a course to one or more users (admin only)
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const isAdmin = roles?.some(
    (r) => r.role === "admin" || r.role === "super_admin"
  );

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { course_id, user_ids, due_date } = body as {
    course_id?: string;
    user_ids?: string[];
    due_date?: string | null;
  };

  if (!course_id || !Array.isArray(user_ids) || user_ids.length === 0) {
    return NextResponse.json(
      { error: "A course and at least one user are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Find users already assigned to this course, so we don't create duplicates.
  const { data: existing } = await admin
    .from("course_assignments")
    .select("user_id")
    .eq("course_id", course_id)
    .in("user_id", user_ids);

  const alreadyAssigned = new Set((existing ?? []).map((e) => e.user_id));

  const toInsert = user_ids
    .filter((id) => !alreadyAssigned.has(id))
    .map((id) => ({
      course_id,
      user_id: id,
      status: "not_started",
      due_date: due_date || null,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({
      assigned: 0,
      skipped: user_ids.length,
      message: "All selected users are already assigned to this course.",
    });
  }

  const { error } = await admin.from("course_assignments").insert(toInsert);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create in-app notifications for newly assigned users
  const { data: course } = await admin
    .from("courses")
    .select("title")
    .eq("id", course_id)
    .single();

  const courseTitle = course?.title ?? "a course";

  // E-mail + in-app notification for the newly assigned learners.
  const notified = await notifyAssigned({
    userIds: toInsert.map((row) => row.user_id),
    kind: "course",
    title: courseTitle,
    link: `/courses/${course_id}`,
    dueDate: due_date || null,
  });

  return NextResponse.json({
    assigned: toInsert.length,
    skipped: user_ids.length - toInsert.length,
    emailed: notified.emailed,
    email_error: notified.emailError,
  });
}
