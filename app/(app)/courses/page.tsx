import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { BookOpen, Calendar, Lock, CheckCircle2, Route } from "lucide-react";

type CourseInfo = {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  course_category_links?: {
    course_categories: { name: string } | { name: string }[] | null;
  }[];
};

type Assignment = {
  id: string;
  status: string | null;
  due_date: string | null;
  course_id: string;
  courses: CourseInfo | CourseInfo[] | null;
};

function extractCategoryNames(course: CourseInfo | null): string[] {
  const links = course?.course_category_links;
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => {
      const cc = link.course_categories;
      if (Array.isArray(cc)) return cc[0]?.name;
      return cc?.name;
    })
    .filter((n): n is string => Boolean(n));
}

const statusStyles: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  in_progress: "bg-amber-100 text-amber-700",
  not_started: "bg-slate-100 text-slate-600",
};

export default async function CoursesPage() {
  const t = await getTranslations("courses");
  const locale = await getLocale();
  const statusLabels: Record<string, string> = {
    completed: t("statusCompleted"),
    in_progress: t("statusInProgress"),
    not_started: t("statusNotStarted"),
  };
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get all assignments with course data
  const { data: assignments } = await supabase
    .from("course_assignments")
    .select(
      `
      id,
      status,
      due_date,
      course_id,
      courses (
        id,
        title,
        description,
        thumbnail_url,
        course_category_links (
          course_categories ( name )
        )
      )
    `
    )
    .eq("user_id", user?.id ?? "");

  // Get learning path assignments for this user
  const { data: pathAssignments } = await supabase
    .from("learning_path_assignments")
    .select("path_id")
    .eq("user_id", user?.id ?? "");

  const pathIds = (pathAssignments ?? []).map((pa) => pa.path_id);

  // Get paths + their ordered courses
  const { data: paths } =
    pathIds.length > 0
      ? await supabase
          .from("learning_paths")
          .select("id, title, description")
          .in("id", pathIds)
      : { data: [] };

  const { data: pathCourses } =
    pathIds.length > 0
      ? await supabase
          .from("learning_path_courses")
          .select("path_id, course_id, position")
          .in("path_id", pathIds)
          .order("position", { ascending: true })
      : { data: [] };

  // Fetch course details for ALL courses in the assigned paths (even ones the
  // learner doesn't have an individual assignment for yet), so locked/upcoming
  // path courses still render.
  const pathCourseIds = [
    ...new Set((pathCourses ?? []).map((pc) => pc.course_id)),
  ];
  const { data: pathCourseDetails } =
    pathCourseIds.length > 0
      ? await supabase
          .from("courses")
          .select(
            "id, title, description, thumbnail_url, course_category_links ( course_categories ( name ) )"
          )
          .in("id", pathCourseIds)
      : { data: [] };

  const courseDetailsMap = new Map<string, CourseInfo>();
  for (const c of pathCourseDetails ?? []) {
    courseDetailsMap.set(c.id, c as unknown as CourseInfo);
  }

  const list = (assignments ?? []) as Assignment[];

  // Build a map of course_id → assignment for quick lookup
  const assignmentByCourse = new Map<string, Assignment>();
  for (const a of list) {
    assignmentByCourse.set(a.course_id, a);
  }

  // Determine which courses are in paths vs standalone
  const coursesInPaths = new Set<string>();
  for (const pc of pathCourses ?? []) {
    coursesInPaths.add(pc.course_id);
  }

  const standaloneCourses = list.filter(
    (a) => !coursesInPaths.has(a.course_id)
  );

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {t("title")}
        </h1>
        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
        <p className="mt-4 text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      {/* Learning Paths */}
      {(paths ?? []).length > 0 && (
        <div className="space-y-8 mb-10">
          {(paths ?? []).map((path) => {
            const orderedCourses = (pathCourses ?? [])
              .filter((pc) => pc.path_id === path.id)
              .sort((a, b) => a.position - b.position);

            const completedCount = orderedCourses.filter((pc) => {
              const assignment = assignmentByCourse.get(pc.course_id);
              return assignment?.status === "completed";
            }).length;

            return (
              <section key={path.id}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-lg bg-pd-red/10 p-2 text-pd-red">
                    <Route size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {path.title}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {t("pathProgress", {
                        done: completedCount,
                        total: orderedCourses.length,
                      })}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-pd-red transition-all"
                    style={{
                      width: `${
                        orderedCourses.length > 0
                          ? (completedCount / orderedCourses.length) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {orderedCourses.map((pc, idx) => {
                    const assignment = assignmentByCourse.get(pc.course_id);
                    // Prefer full course details (available for all path
                    // courses); fall back to the assignment's joined course.
                    const course =
                      courseDetailsMap.get(pc.course_id) ??
                      (assignment
                        ? Array.isArray(assignment.courses)
                          ? assignment.courses[0]
                          : assignment.courses
                        : null);

                    const status = assignment?.status ?? "not_started";

                    // Locked: previous course in path must be completed
                    const isLocked =
                      idx > 0 &&
                      (() => {
                        const prevCourseId =
                          orderedCourses[idx - 1].course_id;
                        const prevAssignment =
                          assignmentByCourse.get(prevCourseId);
                        return prevAssignment?.status !== "completed";
                      })();

                    if (!course) return null;

                    return (
                      <div key={pc.course_id} className="relative">
                        {isLocked ? (
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white opacity-60 shadow-sm">
                            <div className="flex h-36 items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300">
                              <Lock size={32} className="text-slate-400" />
                            </div>
                            <div className="p-5">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                                  {t("locked")}
                                </span>
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                                  {idx + 1}
                                </span>
                              </div>
                              <h2 className="mt-3 font-semibold text-slate-700">
                                {course.title}
                              </h2>
                              <p className="mt-1 text-xs text-slate-400">
                                {t("lockedHint")}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <Link
                            href={`/courses/${course.id}`}
                            className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                          >
                            <div className="flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-pd-navy to-pd-navy-surface">
                              {course.thumbnail_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={course.thumbnail_url}
                                  alt={course.title}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <BookOpen
                                  size={36}
                                  className="text-white/70"
                                />
                              )}
                            </div>
                            <div className="p-5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                    statusStyles[status] ??
                                    statusStyles.not_started
                                  }`}
                                >
                                  {statusLabels[status] ?? t("statusNotStarted")}
                                </span>
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pd-red text-[10px] font-bold text-white">
                                  {idx + 1}
                                </span>
                                {extractCategoryNames(course).map((name) => (
                                  <span
                                    key={name}
                                    className="inline-flex rounded-full bg-pd-red/10 px-2.5 py-1 text-xs font-medium text-pd-red"
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                              <h2 className="mt-3 font-semibold text-slate-900">
                                {course.title}
                              </h2>
                              {course.description && (
                                <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                                  {course.description}
                                </p>
                              )}
                              {assignment?.due_date && (
                                <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                                  <Calendar size={14} />
                                  {t("due", {
                                    date: new Date(
                                      assignment.due_date
                                    ).toLocaleDateString(locale),
                                  })}
                                </div>
                              )}
                            </div>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Standalone courses (not in any path) */}
      {standaloneCourses.length > 0 && (
        <section>
          {(paths ?? []).length > 0 && (
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-900">
                {t("additional")}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {t("additionalHint")}
              </p>
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {standaloneCourses.map((assignment) => {
              const course = Array.isArray(assignment.courses)
                ? assignment.courses[0]
                : assignment.courses;

              if (!course) return null;

              const status = assignment.status ?? "not_started";

              return (
                <Link
                  key={assignment.id}
                  href={`/courses/${course.id}`}
                  className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-pd-navy to-pd-navy-surface">
                    {course.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={course.thumbnail_url}
                        alt={course.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <BookOpen size={36} className="text-white/70" />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          statusStyles[status] ?? statusStyles.not_started
                        }`}
                      >
                        {statusLabels[status] ?? t("statusNotStarted")}
                      </span>
                      {extractCategoryNames(course).map((name) => (
                        <span
                          key={name}
                          className="inline-flex rounded-full bg-pd-red/10 px-2.5 py-1 text-xs font-medium text-pd-red"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                    <h2 className="mt-3 font-semibold text-slate-900">
                      {course.title}
                    </h2>
                    {course.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                        {course.description}
                      </p>
                    )}
                    {assignment.due_date && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                        <Calendar size={14} />
                        {t("due", {
                          date: new Date(
                            assignment.due_date
                          ).toLocaleDateString(locale),
                        })}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {list.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pd-red/10">
            <BookOpen size={28} className="text-pd-red" />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">
            {t("emptyTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            {t("emptyHint")}
          </p>
        </div>
      )}
    </div>
  );
}
