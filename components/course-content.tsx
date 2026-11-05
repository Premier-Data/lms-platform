"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AddModuleForm } from "@/components/add-module-form";
import { AddLessonForm } from "@/components/add-lesson-form";
import { ModuleMenu } from "@/components/module-menu";
import { ModuleLessons } from "@/components/module-lessons";

type Module = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
};

type Lesson = {
  id: string;
  module_id: string;
  title: string;
  lesson_type: string;
  position: number;
};

type Props = {
  courseId: string;
  initialModules: Module[];
  initialLessons: Lesson[];
};

export function CourseContent({
  courseId,
  initialModules,
  initialLessons,
}: Props) {
  const supabase = createClient();
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons);

  // Re-fetch the whole tree from the DB. Called by the add/edit forms so new
  // modules/lessons appear immediately without a full page reload.
  const reload = useCallback(async () => {
    const { data: mods } = await supabase
      .from("modules")
      .select("id, course_id, title, description, position")
      .eq("course_id", courseId)
      .order("position", { ascending: true });

    const modList = (mods ?? []) as Module[];
    setModules(modList);

    const moduleIds = modList.map((m) => m.id);
    if (moduleIds.length === 0) {
      setLessons([]);
      return;
    }

    const { data: less } = await supabase
      .from("lessons")
      .select("id, module_id, title, lesson_type, position")
      .in("module_id", moduleIds)
      .order("position", { ascending: true });

    setLessons((less ?? []) as Lesson[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Keep state in sync if the server re-renders with new props.
  useEffect(() => {
    setModules(initialModules);
    setLessons(initialLessons);
  }, [initialModules, initialLessons]);

  return (
    <>
      {/* Content header */}
      <div className="mt-8 mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Course Content
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Organise your training into modules and lessons.
          </p>
        </div>
        <AddModuleForm courseId={courseId} onCreated={reload} />
      </div>

      {modules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <BookOpen size={30} className="text-slate-500" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-slate-900">
            Start building your course
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Add your first module, then organise it with lessons, videos,
            images, quizzes and assessments.
          </p>
          <div className="mt-6">
            <AddModuleForm courseId={courseId} onCreated={reload} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
      {modules.map((module, moduleIndex) => {
        const moduleLessons = lessons.filter(
          (l) => l.module_id === module.id
        );

        return (
          <div
            key={module.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            {/* Module header */}
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
                <AddLessonForm moduleId={module.id} onCreated={reload} />
                <ModuleMenu
                  moduleId={module.id}
                  courseId={courseId}
                  title={module.title}
                  description={module.description}
                  onChanged={reload}
                />
              </div>
            </div>

            {/* Lessons */}
            <div className="border-t border-slate-200 bg-slate-50">
              <ModuleLessons
                courseId={courseId}
                lessons={moduleLessons}
                onChanged={reload}
              />
            </div>
          </div>
        );
          })}
        </div>
      )}
    </>
  );
}
