import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAssigned } from "@/lib/assignment-notify";

// GET /api/admin/learning-paths/assign?path_id=...
// Lists the users already assigned to a learning path.
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
  const isAdmin =
    roles?.some((r) => r.role === "admin" || r.role === "super_admin") ?? false;
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pathId = new URL(request.url).searchParams.get("path_id");
  if (!pathId) {
    return NextResponse.json({ error: "path_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("learning_path_assignments")
    .select("*")
    .eq("path_id", pathId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    assignments: (data ?? []).map((a) => ({
      user_id: a.user_id as string,
      assigned_at: (a.assigned_at ?? a.created_at ?? null) as string | null,
    })),
  });
}

// POST /api/admin/learning-paths/assign
// Assigns a learning path to one or more users.
// Also auto-creates course_assignments for each course in the path.
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

  const isAdmin =
    roles?.some((r) => r.role === "admin" || r.role === "super_admin") ?? false;

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { path_id, user_ids } = body as {
    path_id?: string;
    user_ids?: string[];
  };

  if (!path_id || !Array.isArray(user_ids) || user_ids.length === 0) {
    return NextResponse.json(
      { error: "path_id and at least one user_id are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Get courses in this path (ordered)
  const { data: pathCourses } = await admin
    .from("learning_path_courses")
    .select("course_id, position")
    .eq("path_id", path_id)
    .order("position", { ascending: true });

  const courseIds = (pathCourses ?? []).map((pc) => pc.course_id);

  let assignedPaths = 0;
  let assignedCourses = 0;
  const newlyAssigned: string[] = [];

  for (const userId of user_ids) {
    // Check if already assigned this path
    const { data: existing } = await admin
      .from("learning_path_assignments")
      .select("id")
      .eq("path_id", path_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      // Create path assignment
      await admin.from("learning_path_assignments").insert({
        path_id,
        user_id: userId,
      });
      assignedPaths++;
      newlyAssigned.push(userId);
    }

    // Create course assignments for each course in the path (skip existing)
    for (const courseId of courseIds) {
      const { data: existingCourse } = await admin
        .from("course_assignments")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingCourse) {
        await admin.from("course_assignments").insert({
          course_id: courseId,
          user_id: userId,
          status: "not_started",
        });
        assignedCourses++;
      }
    }
  }

  // E-mail + in-app notification for users newly given this path.
  const { data: path } = await admin
    .from("learning_paths")
    .select("title")
    .eq("id", path_id)
    .maybeSingle();
  const notified = await notifyAssigned({
    userIds: newlyAssigned,
    kind: "path",
    title: path?.title ?? "a learning path",
    link: courseIds[0] ? `/courses/${courseIds[0]}` : "/courses",
    courseCount: courseIds.length,
  });

  return NextResponse.json({
    assigned_paths: assignedPaths,
    assigned_courses: assignedCourses,
    skipped: user_ids.length - assignedPaths,
    emailed: notified.emailed,
    email_error: notified.emailError,
  });
}
