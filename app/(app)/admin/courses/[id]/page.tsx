import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AddModuleForm } from "@/components/add-module-form";
import { AddLessonForm } from "@/components/add-lesson-form";
import { CoursePublishButton } from "@/components/course-publish-button";
import { EditCourseDetails } from "@/components/edit-course-details";
import { ModuleMenu } from "@/components/module-menu";
import { ModuleLessons } from "@/components/module-lessons";

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

      {/* Content Header */}
      <div className="mt-8 mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Course Content
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Organise your training into modules and lessons.
          </p>
        </div>

        <AddModuleForm courseId={course.id} />
      </div>

      {/* Empty State */}
      {!modules || modules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <BookOpen size={30} className="text-slate-500" />
          </div>

          <h3 className="mt-5 text-lg font-semibold text-slate-900">
            Start building your course
          </h3>

          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Add your first module, then organise it with lessons,
            videos, images, quizzes and assessments.
          </p>

          <div className="mt-6">
            <AddModuleForm courseId={course.id} />
          </div>
        </div>
      ) : (
        /* Modules */
        <div className="space-y-5">
          {modules.map((module, moduleIndex) => {
            const moduleLessons =
              lessons?.filter(
                (lesson: Lesson) =>
                  lesson.module_id === module.id
              ) ?? [];

            return (
              <div
                key={module.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                {/* Module Header */}
                <div className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                      {moduleIndex + 1}
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {module.title}
                      </h3>

                      {module.description && (
                        <p className="mt-1 text-sm text-slate-500">
                          {module.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <AddLessonForm moduleId={module.id} />
                    <ModuleMenu
                      moduleId={module.id}
                      courseId={course.id}
                      title={module.title}
                      description={module.description}
                    />
                  </div>
                </div>

                {/* Lessons */}
                <div className="border-t border-slate-200 bg-slate-50">
                  <ModuleLessons
                    courseId={course.id}
                    lessons={moduleLessons}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}