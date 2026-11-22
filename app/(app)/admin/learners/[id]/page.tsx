import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  FileText,
  Film,
  HelpCircle,
  Mail,
  MapPin,
  Video,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDuration, readPageTime, readTimeSpent } from "@/lib/time-tracking";
import { LearnerActivityPanel } from "@/components/learner-activity-panel";

export const dynamic = "force-dynamic";

type Lesson = { id: string; module_id: string; title: string; lesson_type: string; position: number };
type Page = { id: string; lesson_id: string; title: string | null; position: number };

const STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: "Completed", cls: "bg-green-100 text-green-700" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-700" },
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-600" },
};

function LessonIcon({ type }: { type: string }) {
  const cls = "shrink-0 text-slate-400";
  if (type === "video") return <Video size={15} className={cls} />;
  if (type === "quiz") return <HelpCircle size={15} className={cls} />;
  if (type === "assessment") return <ClipboardCheck size={15} className={cls} />;
  if (type === "coding_drill") return <Film size={15} className={cls} />;
  return <FileText size={15} className={cls} />;
}

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export default async function LearnerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: authUser } = await admin.auth.admin.getUserById(id);
  if (!authUser?.user) notFound();
  const u = authUser.user;

  const [{ data: profile }, { data: roleRows }, { data: assignments }, { data: pathRows }] = await Promise.all([
    admin.from("profiles").select("full_name, location").eq("id", id).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", id),
    admin
      .from("course_assignments")
      .select("id, course_id, status, assigned_at, completed_at, due_date, progress, courses ( id, title )")
      .eq("user_id", id),
    admin.from("learning_path_assignments").select("path_id, assigned_at, learning_paths ( title )").eq("user_id", id),
  ]);

  const courseIds = (assignments ?? []).map((a) => a.course_id as string);
  const { data: modules } = courseIds.length
    ? await admin.from("modules").select("id, course_id, title, position").in("course_id", courseIds).order("position")
    : { data: [] };
  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } = moduleIds.length
    ? await admin
        .from("lessons")
        .select("id, module_id, title, lesson_type, position")
        .in("module_id", moduleIds)
        .order("position")
    : { data: [] };
  const lessonIds = (lessons ?? []).map((l) => l.id);
  const [{ data: pages }, { data: quizAttempts }, { data: drillAttempts }] = await Promise.all([
    lessonIds.length
      ? admin.from("lesson_pages").select("id, lesson_id, title, position").in("lesson_id", lessonIds).order("position")
      : Promise.resolve({ data: [] as Page[] }),
    lessonIds.length
      ? admin.from("quiz_attempts").select("lesson_id, percentage, passed").eq("user_id", id).in("lesson_id", lessonIds)
      : Promise.resolve({ data: [] as { lesson_id: string; percentage: number; passed: boolean }[] }),
    lessonIds.length
      ? admin.from("coding_drill_attempts").select("block_id, accuracy").eq("user_id", id).in("block_id", lessonIds)
      : Promise.resolve({ data: [] as { block_id: string; accuracy: number }[] }),
  ]);

  // Quiz / drill stats per lesson
  const quiz = new Map<string, { attempts: number; best: number; passed: boolean }>();
  for (const a of quizAttempts ?? []) {
    const q = quiz.get(a.lesson_id) ?? { attempts: 0, best: 0, passed: false };
    q.attempts++;
    q.best = Math.max(q.best, a.percentage ?? 0);
    q.passed ||= !!a.passed;
    quiz.set(a.lesson_id, q);
  }
  const drill = new Map<string, { attempts: number; best: number }>();
  for (const a of drillAttempts ?? []) {
    const d = drill.get(a.block_id) ?? { attempts: 0, best: 0 };
    d.attempts++;
    d.best = Math.max(d.best, a.accuracy ?? 0);
    drill.set(a.block_id, d);
  }

  const lessonsByModule = new Map<string, Lesson[]>();
  for (const l of (lessons ?? []) as Lesson[]) {
    const list = lessonsByModule.get(l.module_id) ?? [];
    list.push(l);
    lessonsByModule.set(l.module_id, list);
  }
  const pagesByLesson = new Map<string, Page[]>();
  for (const p of (pages ?? []) as Page[]) {
    const list = pagesByLesson.get(p.lesson_id) ?? [];
    list.push(p);
    pagesByLesson.set(p.lesson_id, list);
  }

  const courses = (assignments ?? [])
    .map((a) => {
      const c = Array.isArray(a.courses) ? a.courses[0] : a.courses;
      const lessonTime = readTimeSpent(a.progress);
      const pageTime = readPageTime(a.progress);
      const completed = new Set<string>(
        ((a.progress as { completed_lessons?: string[] } | null)?.completed_lessons ?? []).filter(Boolean)
      );
      const mods = (modules ?? [])
        .filter((m) => m.course_id === a.course_id)
        .sort((x, y) => x.position - y.position)
        .map((m) => {
          const ls = (lessonsByModule.get(m.id) ?? [])
            .sort((x, y) => x.position - y.position)
            .map((l) => ({
              ...l,
              seconds: lessonTime[l.id] ?? 0,
              done: completed.has(l.id),
              quiz: quiz.get(l.id),
              drill: drill.get(l.id),
              pages: (pagesByLesson.get(l.id) ?? [])
                .sort((x, y) => x.position - y.position)
                .map((p) => ({ ...p, seconds: pageTime[p.id] ?? 0 })),
            }));
          return { ...m, lessons: ls, seconds: ls.reduce((n, l) => n + l.seconds, 0) };
        });
      const total = Object.values(lessonTime).reduce((n, s) => n + s, 0);
      return {
        assignmentId: a.id as string,
        courseId: a.course_id as string,
        title: (c?.title as string) ?? "Deleted course",
        status: (a.status as string) ?? "not_started",
        assignedAt: a.assigned_at as string | null,
        completedAt: a.completed_at as string | null,
        dueDate: a.due_date as string | null,
        seconds: total,
        lessonsDone: mods.reduce((n, m) => n + m.lessons.filter((l) => l.done).length, 0),
        lessonsTotal: mods.reduce((n, m) => n + m.lessons.length, 0),
        modules: mods,
      };
    })
    .sort(
      (x, y) =>
        ({ in_progress: 0, not_started: 1, completed: 2 }[x.status] ?? 3) -
          ({ in_progress: 0, not_started: 1, completed: 2 }[y.status] ?? 3) || y.seconds - x.seconds
    );

  const totalSeconds = courses.reduce((n, c) => n + c.seconds, 0);
  const done = courses.filter((c) => c.status === "completed").length;
  const allQuiz = [...quiz.values()];
  const avgQuiz = allQuiz.length ? Math.round(allQuiz.reduce((n, q) => n + q.best, 0) / allQuiz.length) : null;
  const name = (profile?.full_name as string) || (u.user_metadata?.full_name as string) || u.email || "Learner";
  const role = roleRows?.[0]?.role ?? "learner";

  return (
    <div className="mx-auto max-w-7xl">
      <Link
        href="/admin/reports"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={18} />
        Back to Reports
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pd-red text-xl font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Mail size={14} />
              {u.email}
            </span>
            {profile?.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} />
                {profile.location}
              </span>
            )}
            <span className="capitalize">{role.replace("_", " ")}</span>
            <span>Joined {fmtDate(u.created_at)}</span>
            <span>Last sign-in {fmtDate(u.last_sign_in_at)}</span>
          </div>
          {(pathRows ?? []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {(pathRows ?? []).map((p) => {
                const lp = Array.isArray(p.learning_paths) ? p.learning_paths[0] : p.learning_paths;
                return (
                  <span key={p.path_id} className="rounded-full bg-pd-red/10 px-2.5 py-1 text-xs font-medium text-pd-red">
                    {(lp?.title as string) ?? "Learning path"}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <Stat icon={<Clock size={18} />} label="Time in courses (all time)" value={formatDuration(totalSeconds)} />
        <Stat icon={<CheckCircle2 size={18} />} label="Courses completed" value={`${done} / ${courses.length}`} />
        <Stat icon={<HelpCircle size={18} />} label="Avg best quiz score" value={avgQuiz === null ? "—" : `${avgQuiz}%`} />
        <Stat
          icon={<Film size={18} />}
          label="Best drill accuracy"
          value={drill.size ? `${Math.max(...[...drill.values()].map((d) => d.best))}%` : "—"}
        />
      </div>

      {/* Courses → modules → lessons → pages */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Time per course, module, lesson and page</h2>
        <p className="mb-4 text-sm text-slate-500">
          Active learning time inside each course (idle time isn&apos;t counted). Per-page times are recorded from now on;
          earlier visits only have lesson totals. Click a course to expand it.
        </p>
        <div className="space-y-3">
          {courses.map((c) => (
            <details key={c.assignmentId} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white" open={c.status === "in_progress"}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-5 py-4 hover:bg-slate-50">
                <BookOpen size={18} className="text-pd-red" />
                <span className="flex-1 font-semibold text-slate-900">{c.title}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[c.status]?.cls ?? STATUS.not_started.cls}`}>
                  {STATUS[c.status]?.label ?? c.status}
                </span>
                <span className="text-xs text-slate-500">
                  {c.lessonsDone}/{c.lessonsTotal} lessons
                </span>
                <span className="text-xs text-slate-400">
                  Assigned {fmtDate(c.assignedAt)}
                  {c.completedAt ? ` · Completed ${fmtDate(c.completedAt)}` : ""}
                  {c.dueDate && !c.completedAt ? ` · Due ${fmtDate(c.dueDate)}` : ""}
                </span>
                <span className="w-20 text-right font-bold tabular-nums text-slate-900">{formatDuration(c.seconds)}</span>
              </summary>

              <div className="border-t border-slate-100">
                {c.modules.length === 0 && <p className="px-5 py-4 text-sm text-slate-400">This course has no modules.</p>}
                {c.modules.map((m, mi) => (
                  <div key={m.id} className="border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-3 bg-slate-50 px-5 py-2.5">
                      <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {mi + 1}. {m.title}
                      </span>
                      <span className="w-20 text-right text-sm font-semibold tabular-nums text-slate-700">
                        {formatDuration(m.seconds)}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-50">
                        {m.lessons.map((l) => (
                          <LessonRows key={l.id} lesson={l} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </details>
          ))}
          {courses.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400">
              No courses assigned.
            </p>
          )}
        </div>
      </section>

      {/* Daily activity */}
      <section id="activity">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Daily activity</h2>
        <p className="mb-4 text-sm text-slate-500">
          Everything on the platform, not just inside courses. A gap of 5+ minutes with no activity counts as a break.
          Times are in your time zone.
        </p>
        <LearnerActivityPanel userId={id} />
      </section>
    </div>
  );
}

function LessonRows({
  lesson: l,
}: {
  lesson: Lesson & {
    seconds: number;
    done: boolean;
    quiz?: { attempts: number; best: number; passed: boolean };
    drill?: { attempts: number; best: number };
    pages: (Page & { seconds: number })[];
  };
}) {
  const showPages = l.pages.length > 1 || (l.pages.length === 1 && l.pages[0].seconds > 0);
  return (
    <>
      <tr>
        <td className="px-5 py-2.5">
          <div className="flex items-center gap-2.5">
            <LessonIcon type={l.lesson_type} />
            <span className="font-medium text-slate-800">{l.title}</span>
            {l.done && <CheckCircle2 size={14} className="text-green-600" />}
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-slate-500">
          {l.quiz
            ? `Quiz best ${l.quiz.best}% · ${l.quiz.attempts} attempt${l.quiz.attempts === 1 ? "" : "s"}${l.quiz.passed ? " · passed" : ""}`
            : l.drill
              ? `Drill best ${l.drill.best}% · ${l.drill.attempts} attempt${l.drill.attempts === 1 ? "" : "s"}`
              : ""}
        </td>
        <td className="w-24 px-5 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatDuration(l.seconds)}</td>
      </tr>
      {showPages &&
        l.pages.map((p, i) => (
          <tr key={p.id} className="text-xs">
            <td className="py-1.5 pl-12 pr-5 text-slate-500" colSpan={2}>
              Page {i + 1}
              {p.title ? ` · ${p.title}` : ""}
            </td>
            <td className="w-24 px-5 py-1.5 text-right tabular-nums text-slate-500">{formatDuration(p.seconds)}</td>
          </tr>
        ))}
    </>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <span className="text-pd-red">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
