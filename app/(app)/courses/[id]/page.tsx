import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CourseViewer } from "@/components/course-viewer";

type CourseViewerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CourseViewerPage({
  params,
}: CourseViewerPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Load the course
  const { data: course } = await supabase
    .from("courses")
    .select("id, title, description, status")
    .eq("id", id)
    .single();

  if (!course) {
    notFound();
  }

  // Confirm the user is assigned to this course.
  // Try selecting progress; if the column doesn't exist yet, fall back.
  let assignment: {
    id: string;
    status: string | null;
    progress?: unknown;
  } | null = null;

  const withProgress = await supabase
    .from("course_assignments")
    .select("id, status, progress")
    .eq("course_id", id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  if (withProgress.error) {
    // progress column may not exist yet — retry without it
    const basic = await supabase
      .from("course_assignments")
      .select("id, status")
      .eq("course_id", id)
      .eq("user_id", user?.id ?? "")
      .maybeSingle();
    assignment = basic.data;
  } else {
    assignment = withProgress.data;
  }

  // Only allow viewing published courses that are assigned to the user
  if (course.status !== "published" || !assignment) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/courses"
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={18} />
          Back to My Courses
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
          <h1 className="text-lg font-semibold text-slate-900">
            {course.status !== "published"
              ? "This course isn't available yet"
              : "You don't have access to this course"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            {course.status !== "published"
              ? "The course hasn't been published. Please check back later."
              : "This course hasn't been assigned to you. Contact your administrator if you think this is a mistake."}
          </p>
        </div>
      </div>
    );
  }

  // Check if this course is in a learning path and if the prerequisite is met
  const { data: pathCourseEntry } = await supabase
    .from("learning_path_courses")
    .select("path_id, position")
    .eq("course_id", id)
    .maybeSingle();

  if (pathCourseEntry && pathCourseEntry.position > 0) {
    // Find the previous course in this path
    const { data: prevPathCourse } = await supabase
      .from("learning_path_courses")
      .select("course_id")
      .eq("path_id", pathCourseEntry.path_id)
      .eq("position", pathCourseEntry.position - 1)
      .maybeSingle();

    if (prevPathCourse) {
      // Check if the user has completed the previous course
      const { data: prevAssignment } = await supabase
        .from("course_assignments")
        .select("status")
        .eq("course_id", prevPathCourse.course_id)
        .eq("user_id", user?.id ?? "")
        .maybeSingle();

      if (prevAssignment?.status !== "completed") {
        return (
          <div className="mx-auto max-w-3xl">
            <Link
              href="/courses"
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft size={18} />
              Back to My Courses
            </Link>

            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
              <h1 className="text-lg font-semibold text-slate-900">
                Course locked
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                You need to complete the previous course in your learning path
                before accessing this one. Return to My Courses to continue
                in order.
              </p>
            </div>
          </div>
        );
      }
    }
  }

  // Load the full course tree
  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, position")
    .eq("course_id", id)
    .order("position", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);

  const { data: lessons } =
    moduleIds.length > 0
      ? await supabase
          .from("lessons")
          .select("id, module_id, title, lesson_type, position, content")
          .in("module_id", moduleIds)
          .order("position", { ascending: true })
      : { data: [] };

  const lessonIds = (lessons ?? []).map((l) => l.id);

  const { data: pages } =
    lessonIds.length > 0
      ? await supabase
          .from("lesson_pages")
          .select("id, lesson_id, title, position")
          .in("lesson_id", lessonIds)
          .order("position", { ascending: true })
      : { data: [] };

  const pageIds = (pages ?? []).map((p) => p.id);

  const { data: blocks } =
    pageIds.length > 0
      ? await supabase
          .from("lesson_blocks")
          .select("id, page_id, block_type, content, position")
          .in("page_id", pageIds)
          .order("position", { ascending: true })
      : { data: [] };

  // progress shape: { lesson_id?: string, page_index?: number, completed_lessons?: string[] }
  const progress =
    (assignment as { progress?: unknown }).progress &&
    typeof (assignment as { progress?: unknown }).progress === "object"
      ? ((assignment as { progress?: Record<string, unknown> }).progress ?? {})
      : {};

  return (
    <CourseViewer
      course={course}
      assignmentId={assignment.id}
      assignmentStatus={assignment.status ?? "not_started"}
      savedProgress={progress}
      modules={modules ?? []}
      lessons={lessons ?? []}
      pages={pages ?? []}
      blocks={blocks ?? []}
    />
  );
}
