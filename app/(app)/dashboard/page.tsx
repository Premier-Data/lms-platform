import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  TrendingUp,
} from "lucide-react";

// Pulls category names out of a course's nested course_category_links,
// normalizing the object-or-array shape Supabase may return.
function extractCategoryNames(course: unknown): string[] {
  const links = (course as { course_category_links?: unknown })
    ?.course_category_links;
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => {
      const cc = (link as { course_categories?: unknown }).course_categories;
      if (Array.isArray(cc)) return (cc[0] as { name?: string })?.name;
      return (cc as { name?: string } | null)?.name;
    })
    .filter((n): n is string => Boolean(n));
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: assignments } = await supabase
    .from("course_assignments")
    .select(`
      id,
      status,
      due_date,
      courses (
        id,
        title,
        description,
        thumbnail_url,
        course_category_links (
          course_categories ( name )
        )
      )
    `)
    .eq("user_id", user?.id ?? "");

  const totalCourses = assignments?.length ?? 0;

  const completedCourses =
    assignments?.filter(
      (assignment) => assignment.status === "completed"
    ).length ?? 0;

  const inProgressCourses =
    assignments?.filter(
      (assignment) => assignment.status === "in_progress"
    ).length ?? 0;

  const completionRate =
    totalCourses > 0
      ? Math.round((completedCourses / totalCourses) * 100)
      : 0;

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

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStat
          title={t("assigned")}
          value={totalCourses}
          icon={<BookOpen size={22} />}
        />

        <DashboardStat
          title={t("inProgress")}
          value={inProgressCourses}
          icon={<Clock3 size={22} />}
        />

        <DashboardStat
          title={t("completed")}
          value={completedCourses}
          icon={<CheckCircle2 size={22} />}
        />

        <DashboardStat
          title={t("completionRate")}
          value={`${completionRate}%`}
          icon={<TrendingUp size={22} />}
          highlight={completionRate === 100}
        />
      </div>

      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-slate-900">
            {t("continueLearning")}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {t("continueHint")}
          </p>
        </div>

        {(() => {
          const activeCourses = (assignments ?? []).filter(
            (a) => a.status !== "completed"
          );

          if (activeCourses.length === 0) {
            return (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pd-red/10">
                  <BookOpen
                    size={28}
                    className="text-pd-red"
                  />
                </div>

                <h3 className="mt-5 font-semibold text-slate-900">
                  {(assignments?.length ?? 0) > 0
                    ? t("allCaughtUp")
                    : t("noneAssigned")}
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                  {(assignments?.length ?? 0) > 0
                    ? t("allDone")
                    : t("noneAssignedHint")}
                </p>
              </div>
            );
          }

          return (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {activeCourses.map((assignment) => {
              const course = Array.isArray(assignment.courses)
                ? assignment.courses[0]
                : assignment.courses;

              const categoryNames = extractCategoryNames(course);

              return (
                <a
                  key={assignment.id}
                  href={course ? `/courses/${course.id}` : "#"}
                  className="group block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="h-32 bg-gradient-to-br from-pd-navy to-pd-navy-surface overflow-hidden">
                    {course?.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={course.thumbnail_url}
                        alt={course.title ?? ""}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>

                  <div className="p-5">
                    {categoryNames.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {categoryNames.map((name) => (
                          <span
                            key={name}
                            className="inline-flex rounded-full bg-pd-red/10 px-2 py-0.5 text-[11px] font-medium text-pd-red"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    )}

                    <h3 className="font-semibold text-slate-900">
                      {course?.title}
                    </h3>

                    <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                      {course?.description}
                    </p>
                  </div>
                </a>
              );
            })}
          </div>
          );
        })()}
      </section>
    </div>
  );
}

function DashboardStat({
  title,
  value,
  icon,
  highlight = false,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>

          <p
            className={`mt-2 text-3xl font-bold ${
              highlight ? "text-green-600" : "text-slate-900"
            }`}
          >
            {value}
          </p>
        </div>

        <div
          className={`rounded-xl p-3 ${
            highlight
              ? "bg-green-100 text-green-600"
              : "bg-pd-red/10 text-pd-red"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}