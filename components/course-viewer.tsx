"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Check,
  FileText,
  Video,
  HelpCircle,
  ClipboardCheck,
  Film,
  Loader2,
  Save,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QuizTaker } from "@/components/quiz-taker";
import { CodingDrillPlayer } from "@/components/coding-drill-player";

type Course = {
  id: string;
  title: string;
  description: string | null;
};

type Module = { id: string; title: string; position: number };
type Lesson = {
  id: string;
  module_id: string;
  title: string;
  lesson_type: string;
  position: number;
  content?: string | null;
};
type Page = {
  id: string;
  lesson_id: string;
  title: string;
  position: number;
};
type Block = {
  id: string;
  page_id: string;
  block_type: string;
  content: string | null;
  position: number;
};

type SavedProgress = {
  lesson_id?: string;
  page_index?: number;
  completed_lessons?: string[];
};

type CourseViewerProps = {
  course: Course;
  assignmentId: string;
  assignmentStatus: string;
  savedProgress: Record<string, unknown>;
  modules: Module[];
  lessons: Lesson[];
  pages: Page[];
  blocks: Block[];
};

export function CourseViewer({
  course,
  assignmentId,
  assignmentStatus,
  savedProgress,
  modules,
  lessons,
  pages,
  blocks,
}: CourseViewerProps) {
  const router = useRouter();
  const supabase = createClient();

  // Flatten lessons in module → lesson order for linear navigation.
  const orderedLessons = useMemo(() => {
    const result: Lesson[] = [];
    for (const m of modules) {
      const modLessons = lessons
        .filter((l) => l.module_id === m.id)
        .sort((a, b) => a.position - b.position);
      result.push(...modLessons);
    }
    return result;
  }, [modules, lessons]);

  const saved = savedProgress as SavedProgress;

  // Restore saved lesson, falling back to the first lesson.
  const initialLessonId =
    saved.lesson_id &&
    orderedLessons.some((l) => l.id === saved.lesson_id)
      ? saved.lesson_id
      : orderedLessons[0]?.id ?? null;

  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    initialLessonId
  );
  const [status, setStatus] = useState(assignmentStatus);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(
    new Set(saved.completed_lessons ?? [])
  );
  const [marking, setMarking] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const activeLesson =
    orderedLessons.find((l) => l.id === activeLessonId) ?? null;

  const lessonPages = useMemo(
    () =>
      activeLesson
        ? pages
            .filter((p) => p.lesson_id === activeLesson.id)
            .sort((a, b) => a.position - b.position)
        : [],
    [activeLesson, pages]
  );

  // Restore saved page index only for the initially restored lesson.
  const [pageIndex, setPageIndex] = useState(
    saved.lesson_id === initialLessonId && typeof saved.page_index === "number"
      ? saved.page_index
      : 0
  );

  const currentLessonIndex = orderedLessons.findIndex(
    (l) => l.id === activeLessonId
  );

  // A lesson counts as "done" once the learner reaches its last page.
  // Mark it whenever the active lesson + page satisfies that.
  useEffect(() => {
    if (!activeLesson) return;
    const total = lessonPages.length;
    const onLastPage = total === 0 || pageIndex >= total - 1;
    if (onLastPage && !completedLessons.has(activeLesson.id)) {
      setCompletedLessons((prev) => {
        const next = new Set(prev);
        next.add(activeLesson.id);
        return next;
      });
    }
  }, [activeLesson, pageIndex, lessonPages.length, completedLessons]);

  // Build the progress object to persist.
  const buildProgress = useCallback(
    (): SavedProgress => ({
      lesson_id: activeLessonId ?? undefined,
      page_index: pageIndex,
      completed_lessons: Array.from(completedLessons),
    }),
    [activeLessonId, pageIndex, completedLessons]
  );

  async function persistProgress() {
    await supabase
      .from("course_assignments")
      .update({
        progress: buildProgress(),
        status: status === "completed" ? "completed" : "in_progress",
      })
      .eq("id", assignmentId);
  }

  // Mark as in_progress the first time the learner opens the course.
  useEffect(() => {
    if (status === "not_started") {
      supabase
        .from("course_assignments")
        .update({ status: "in_progress" })
        .eq("id", assignmentId)
        .then(() => setStatus("in_progress"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save position whenever the lesson or page changes (debounced-ish via
  // the effect firing on change). Skips the very first render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      return;
    }
    if (status === "completed") return;

    let cancelled = false;
    supabase
      .from("course_assignments")
      .update({
        progress: buildProgress(),
        status: "in_progress",
      })
      .eq("id", assignmentId)
      .then(() => {
        if (cancelled) return;
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 1500);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLessonId, pageIndex, completedLessons]);

  function changeLesson(lessonId: string) {
    setActiveLessonId(lessonId);
    setPageIndex(0);
  }

  function goToLesson(index: number) {
    if (index < 0 || index >= orderedLessons.length) return;
    changeLesson(orderedLessons[index].id);
  }

  async function handleSaveExit() {
    setSavingExit(true);
    await persistProgress();
    router.push("/dashboard");
    router.refresh();
  }

  const allLessonsComplete =
    orderedLessons.length > 0 &&
    orderedLessons.every((l) => completedLessons.has(l.id));

  async function markComplete() {
    setMarking(true);
    await supabase
      .from("course_assignments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        progress: buildProgress(),
      })
      .eq("id", assignmentId);
    setStatus("completed");
    setMarking(false);
    router.push("/dashboard");
    router.refresh();
  }

  const currentPage = lessonPages[pageIndex];
  const isLastLesson = currentLessonIndex === orderedLessons.length - 1;
  const isLastPage = lessonPages.length === 0 || pageIndex === lessonPages.length - 1;

  return (
    <div
      className={`mx-auto ${
        activeLesson?.lesson_type === "coding_drill"
          ? "max-w-none"
          : "max-w-7xl"
      }`}
    >
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/courses"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          <ArrowLeft size={18} />
          Back to My Courses
        </Link>

        <div className="flex items-center gap-3">
          {status === "completed" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 size={16} />
              Completed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-700">
              In Progress
            </span>
          )}

          <button
            onClick={handleSaveExit}
            disabled={savingExit}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {savingExit ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            Save &amp; exit
          </button>
        </div>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {course.title}
        </h1>
        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
        <p className="mt-3 text-sm text-slate-500">
          {completedLessons.size} of {orderedLessons.length} lessons complete
        </p>
      </div>

      <div
        className={`grid gap-6 ${
          activeLesson?.lesson_type === "coding_drill"
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[280px_1fr]"
        }`}
      >
        {/* Lesson list sidebar — hidden for coding drills to maximise space */}
        <aside
          className={`rounded-2xl border border-slate-200 bg-white p-3 ${
            activeLesson?.lesson_type === "coding_drill" ? "hidden" : ""
          }`}
        >
          {modules.map((m, mi) => {
            const modLessons = lessons
              .filter((l) => l.module_id === m.id)
              .sort((a, b) => a.position - b.position);

            return (
              <div key={m.id} className="mb-3 last:mb-0">
                <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {mi + 1}. {m.title}
                </p>

                <div className="space-y-0.5">
                  {modLessons.map((lesson) => {
                    const active = lesson.id === activeLessonId;
                    const done = completedLessons.has(lesson.id);
                    return (
                      <button
                        key={lesson.id}
                        onClick={() => changeLesson(lesson.id)}
                        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${
                          active
                            ? "bg-pd-red/10 font-medium text-pd-red"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2
                            size={16}
                            className="shrink-0 text-green-600"
                          />
                        ) : (
                          <LessonIcon
                            type={lesson.lesson_type}
                            active={active}
                          />
                        )}
                        <span className="truncate">{lesson.title}</span>
                      </button>
                    );
                  })}
                  {modLessons.length === 0 && (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      No lessons
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </aside>

        {/* Content area */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          {!activeLesson ? (
            <div className="px-8 py-20 text-center text-slate-400">
              This course has no lessons yet.
            </div>
          ) : activeLesson.lesson_type === "quiz" ? (
            <QuizTaker
              key={activeLesson.id}
              lessonId={activeLesson.id}
              lessonTitle={activeLesson.title}
              onComplete={(passed) => {
                if (passed) {
                  // Mark this quiz lesson as done
                  setCompletedLessons((prev) => {
                    const next = new Set(prev);
                    next.add(activeLesson.id);
                    return next;
                  });

                  if (!isLastLesson) {
                    // Advance to next lesson
                    goToLesson(currentLessonIndex + 1);
                  } else {
                    // Last lesson — mark course complete and go to dashboard
                    markComplete();
                  }
                }
              }}
            />
          ) : activeLesson.lesson_type === "coding_drill" ? (
            <div className="p-6">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  {activeLesson.title}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Watch the video and click a stat the moment it happens, then
                  submit to be graded.
                </p>
              </div>
              <CodingDrillPlayer
                key={activeLesson.id}
                blockId={activeLesson.id}
                content={
                  typeof activeLesson.content === "string"
                    ? activeLesson.content
                    : activeLesson.content
                      ? JSON.stringify(activeLesson.content)
                      : null
                }
                onGraded={() => {
                  setCompletedLessons((prev) => {
                    const next = new Set(prev);
                    next.add(activeLesson.id);
                    return next;
                  });
                }}
              />
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 px-8 py-5">
                <h2 className="text-lg font-semibold text-slate-900">
                  {activeLesson.title}
                </h2>
              </div>

              <div className="px-8 py-8">
                {currentPage ? (
                  <>
                    {currentPage.title && (
                      <h3 className="mb-6 text-2xl font-bold text-slate-900">
                        {currentPage.title}
                      </h3>
                    )}

                    <div className="space-y-6">
                      {blocks
                        .filter((b) => b.page_id === currentPage.id)
                        .sort((a, b) => a.position - b.position)
                        .map((block) => (
                          <ContentBlock key={block.id} block={block} />
                        ))}
                    </div>
                  </>
                ) : (
                  <p className="py-12 text-center text-sm text-slate-400">
                    This lesson has no content yet.
                  </p>
                )}
              </div>

              {/* Page navigation within a lesson */}
              {lessonPages.length > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 px-8 py-4">
                  <button
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex((i) => i - 1)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 disabled:opacity-30"
                  >
                    <ChevronLeft size={17} />
                    Previous
                  </button>
                  <span className="text-xs text-slate-400">
                    Page {pageIndex + 1} of {lessonPages.length}
                  </span>
                  <button
                    disabled={isLastPage}
                    onClick={() => setPageIndex((i) => i + 1)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 disabled:opacity-30"
                  >
                    Next
                    <ChevronRight size={17} />
                  </button>
                </div>
              )}

              {/* Lesson navigation / complete */}
              <div className="flex items-center justify-between border-t border-slate-200 px-8 py-5">
                <button
                  disabled={currentLessonIndex <= 0}
                  onClick={() => goToLesson(currentLessonIndex - 1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                  Previous lesson
                </button>

                {isLastLesson ? (
                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      onClick={markComplete}
                      disabled={
                        marking ||
                        status === "completed" ||
                        !allLessonsComplete
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {marking && (
                        <Loader2 size={16} className="animate-spin" />
                      )}
                      {status === "completed" ? (
                        <>
                          <CheckCircle2 size={16} />
                          Completed
                        </>
                      ) : (
                        "Mark course complete"
                      )}
                    </button>
                    {!allLessonsComplete && status !== "completed" && (
                      <span className="text-xs text-slate-400">
                        Finish all lessons to complete the course.
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => goToLesson(currentLessonIndex + 1)}
                    disabled={!isLastPage}
                    className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next lesson
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {savedNotice && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <Check size={16} className="text-green-400" />
          Progress saved
        </div>
      )}
    </div>
  );
}

function LessonIcon({ type, active }: { type: string; active: boolean }) {
  const cls = active ? "text-pd-red" : "text-slate-400";
  if (type === "video") return <Video size={16} className={cls} />;
  if (type === "quiz") return <HelpCircle size={16} className={cls} />;
  if (type === "assessment")
    return <ClipboardCheck size={16} className={cls} />;
  if (type === "coding_drill") return <Film size={16} className={cls} />;
  return <FileText size={16} className={cls} />;
}

function ContentBlock({ block }: { block: Block }) {
  if (block.block_type === "heading") {
    return (
      <h3 className="text-xl font-bold text-slate-900">{block.content}</h3>
    );
  }

  if (block.block_type === "text") {
    return (
      <div
        className="text-base leading-7 text-slate-700 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_em]:italic [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:mb-2 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_strong]:font-bold [&_u]:underline [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: block.content || "" }}
      />
    );
  }

  if (block.block_type === "image") {
    if (!block.content) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={block.content} alt="" className="h-auto w-full rounded-xl" />
    );
  }

  if (block.block_type === "video") {
    if (!block.content) return null;
    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-slate-900">
        <video src={block.content} controls className="h-full w-full" />
      </div>
    );
  }

  if (block.block_type === "coding_drill") {
    return <CodingDrillPlayer blockId={block.id} content={block.content} />;
  }

  return (
    <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-500">
      {block.content || ""}
    </div>
  );
}
