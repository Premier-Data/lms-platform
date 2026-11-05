import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { CoursePublishButton } from "@/components/course-publish-button";
import { EditCourseDetails } from "@/components/edit-course-details";
import { CourseContent } from "@/components/course-content";

// Always render fresh so newly added modules/lessons appear immediately after
// router.refresh() (no stale route/data cache).
export const dynamic = "force-dynamic";

type CourseEditorPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type Lesson = {
  id: string;
  module_id: string;
  title: string;
  lesson_type: string;
  position: number;
};

export default async function CourseEditorPage({
  params,
}: CourseEditorPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  // Get course
  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (courseError || !course) {
    notFound();
  }

  // Load this course's categories (via the join table). Falls back to empty
  // if the category schema isn't set up yet.
  const { data: categoryLinks } = await supabase
    .from("course_category_links")
    .select("course_categories ( name )")
    .eq("course_id", id);

  const courseCategories: string[] = (categoryLinks ?? [])
    .map((link) => {
      const cc = (link as { course_categories: unknown }).course_categories;
      if (Array.isArray(cc)) return (cc[0] as { name?: string })?.name;
      return (cc as { name?: string } | null)?.name;
    })
    .filter((n): n is string => Boolean(n));

  // Get modules
  const { data: modules, error: modulesError } = await supabase
    .from("modules")
    .select("*")
    .eq("course_id", id)
    .order("position", { ascending: true });

  if (modulesError) {
    console.error("MODULES ERROR:", modulesError);
  }

  // Get lessons for all modules
  const moduleIds = modules?.map((module) => module.id) ?? [];

  const { data: lessons, error: lessonsError } =
    moduleIds.length > 0
      ? await supabase
        .from("lessons")
        .select("*")
        .in("module_id", moduleIds)
        .order("position", { ascending: true })
      : { data: [], error: null };

  if (lessonsError) {
    console.error("LESSONS ERROR:", lessonsError);
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Back */}
      <Link
        href="/admin/courses"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft size={18} />
        Back to Course Builder
      </Link>

      {/* Course Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  course.status === "published"
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {course.status === "published" ? "Published" : "Draft"}
              </span>

              {courseCategories.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-pd-red/10 px-3 py-1 text-xs font-medium text-pd-red"
                >
                  {name}
                </span>
              ))}
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
              {course.title}
            </h1>

            {course.description && (
              <p className="mt-3 max-w-3xl text-slate-500">
                {course.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <CoursePublishButton
              courseId={course.id}
              status={course.status}
            />

            <EditCourseDetails
              courseId={course.id}
              title={course.title}
              description={course.description}
              thumbnailUrl={course.thumbnail_url}
            />
          </div>
        </div>
      </div>

      {/* Course content (modules + lessons) — client component so newly
          added items appear instantly without a page reload. */}
      <CourseContent
        courseId={course.id}
        initialModules={modules ?? []}
        initialLessons={(lessons ?? []) as Lesson[]}
      />
    </div>
  );
}