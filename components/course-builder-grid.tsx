"use client";

import { useMemo, useState } from "react";
import { CourseCard } from "@/components/course-card";

export type BuilderCourse = {
  id: string;
  title: string;
  status: string;
  thumbnailUrl: string | null;
  description: string | null;
  categoryNames: string[];
};

export function CourseBuilderGrid({ courses }: { courses: BuilderCourse[] }) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Distinct categories across all courses, for the filter dropdown.
  const categories = useMemo(
    () =>
      Array.from(
        new Set(courses.flatMap((c) => c.categoryNames))
      ).sort((a, b) => a.localeCompare(b)),
    [courses]
  );

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return courses;
    if (categoryFilter === "__none__")
      return courses.filter((c) => c.categoryNames.length === 0);
    return courses.filter((c) => c.categoryNames.includes(categoryFilter));
  }, [courses, categoryFilter]);

  return (
    <div>
      {/* Category filter (only shown when there are categories to filter by) */}
      {categories.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Category
          </span>
          <button
            onClick={() => setCategoryFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              categoryFilter === "all"
                ? "bg-pd-red text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                categoryFilter === cat
                  ? "bg-pd-red text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setCategoryFilter("__none__")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              categoryFilter === "__none__"
                ? "bg-pd-red text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Uncategorised
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No courses in this category.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <CourseCard
              key={course.id}
              id={course.id}
              title={course.title}
              status={course.status}
              thumbnailUrl={course.thumbnailUrl}
              description={course.description}
              categoryNames={course.categoryNames}
            />
          ))}
        </div>
      )}
    </div>
  );
}
