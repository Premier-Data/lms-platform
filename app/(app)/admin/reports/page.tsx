import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  Users,
  BookOpen,
  CheckCircle2,
  TrendingUp,
  Clock,
  Target,
  Award,
  AlertCircle,
} from "lucide-react";
import { UserProgressTable } from "@/components/user-progress-table";
import { CoursePerformanceTable } from "@/components/course-performance-table";
import { formatDuration, readTimeSpent } from "@/lib/time-tracking";

export default async function ReportsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();

  // Fetch all data in parallel
  const [
    { data: allUsers },
    { data: allCourses },
    { data: allAssignments },
    { data: allCategoryLinks },
    { data: allAttempts },
    { data: allAnswers },
    { data: allQuestions },
    { data: allDrillAttempts },
    { data: allLessons },
    { data: allModules },
    { data: allProgress },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("courses").select("id, title, status"),
    supabase
      .from("course_assignments")
      .select("id, course_id, user_id, status, assigned_at, completed_at"),
    supabase
      .from("course_category_links")
      .select("course_id, course_categories ( name )"),
    supabase
      .from("quiz_attempts")
      .select(
        "id, lesson_id, user_id, score, max_score, percentage, passed, started_at, completed_at, time_spent_seconds"
      ),
    supabase
      .from("quiz_answers")
      .select("id, attempt_id, question_id, is_correct"),
    supabase
      .from("quiz_questions")
      .select("id, lesson_id, question_text, question_type"),
    // Coding drill attempts (may not exist in older environments → ignore error)
    supabase
      .from("coding_drill_attempts")
      .select(
        "id, block_id, user_id, accuracy, exact, missed, extra, created_at"
      ),
    supabase
      .from("lessons")
      .select("id, title, lesson_type, module_id, position"),
    supabase.from("modules").select("id, course_id, title, position"),
    // Kept separate so reports still load if the progress column is missing.
    supabase.from("course_assignments").select("course_id, user_id, progress"),
  ]);

  // --- Time spent (active seconds per lesson, from learner progress) ---
  const timeRows = (allProgress ?? []).map((a) => ({
    courseId: a.course_id as string,
    userId: a.user_id as string,
    perLesson: readTimeSpent(a.progress),
  }));
  const sumValues = (o: Record<string, number>) =>
    Object.values(o).reduce((s, n) => s + n, 0);

  const timeByUser = new Map<string, number>();
  const timeByCourse = new Map<string, { total: number; learners: number }>();
  const timeByLesson = new Map<string, { total: number; learners: number }>();
  for (const r of timeRows) {
    const total = sumValues(r.perLesson);
    if (total <= 0) continue;
    timeByUser.set(r.userId, (timeByUser.get(r.userId) ?? 0) + total);
    const c = timeByCourse.get(r.courseId) ?? { total: 0, learners: 0 };
    c.total += total;
    c.learners += 1;
    timeByCourse.set(r.courseId, c);
    for (const [lessonId, secs] of Object.entries(r.perLesson)) {
      const l = timeByLesson.get(lessonId) ?? { total: 0, learners: 0 };
      l.total += secs;
      l.learners += 1;
      timeByLesson.set(lessonId, l);
    }
  }

  const users = allUsers?.users ?? [];
  const courses = allCourses ?? [];
  const assignments = allAssignments ?? [];
  const attempts = allAttempts ?? [];
  const answers = allAnswers ?? [];
  const questions = allQuestions ?? [];

  // --- Overview Metrics ---
  const totalUsers = users.length;
  const totalCourses = courses.length;
  const totalAssignments = assignments.length;
  const completedAssignments = assignments.filter(
    (a) => a.status === "completed"
  ).length;
  const inProgressAssignments = assignments.filter(
    (a) => a.status === "in_progress"
  ).length;
  const overallCompletionRate =
    totalAssignments > 0
      ? Math.round((completedAssignments / totalAssignments) * 100)
      : 0;
  const avgQuizScore =
    attempts.length > 0
      ? Math.round(
          attempts.reduce((sum, a) => sum + (a.percentage ?? 0), 0) /
            attempts.length
        )
      : 0;
  const quizPassRate =
    attempts.length > 0
      ? Math.round(
          (attempts.filter((a) => a.passed).length / attempts.length) * 100
        )
      : 0;

  // Per-user coding-drill stats: attempt count + best accuracy.
  const drillAttemptsRaw = allDrillAttempts ?? [];
  const drillStatsByUser = new Map<
    string,
    { attempts: number; best: number }
  >();
  for (const a of drillAttemptsRaw) {
    const uid = a.user_id as string;
    const acc = (a.accuracy as number) ?? 0;
    const entry = drillStatsByUser.get(uid) ?? { attempts: 0, best: 0 };
    entry.attempts += 1;
    entry.best = Math.max(entry.best, acc);
    drillStatsByUser.set(uid, entry);
  }

  // --- User Progress ---
  const userProgress = users.map((u) => {
    const userAssignments = assignments.filter((a) => a.user_id === u.id);
    const completed = userAssignments.filter(
      (a) => a.status === "completed"
    ).length;
    const inProgress = userAssignments.filter(
      (a) => a.status === "in_progress"
    ).length;
    const userAttempts = attempts.filter((a) => a.user_id === u.id);
    const avgScore =
      userAttempts.length > 0
        ? Math.round(
            userAttempts.reduce((s, a) => s + (a.percentage ?? 0), 0) /
              userAttempts.length
          )
        : null;

    const drill = drillStatsByUser.get(u.id);

    return {
      id: u.id,
      name: u.user_metadata?.full_name ?? u.email ?? "Unknown",
      email: u.email ?? "",
      assigned: userAssignments.length,
      completed,
      inProgress,
      notStarted: userAssignments.length - completed - inProgress,
      avgQuizScore: avgScore,
      totalAttempts: userAttempts.length,
      drillAttempts: drill?.attempts ?? 0,
      bestDrillAccuracy: drill ? drill.best : null,
      totalTimeSeconds: timeByUser.get(u.id) ?? 0,
    };
  });

  // Map course_id -> category names (via the join table).
  const categoryLinks = allCategoryLinks ?? [];
  const categoriesByCourse = new Map<string, string[]>();
  for (const link of categoryLinks) {
    const courseId = (link as { course_id: string }).course_id;
    const cc = (link as { course_categories: unknown }).course_categories;
    const name = Array.isArray(cc)
      ? (cc[0] as { name?: string })?.name
      : (cc as { name?: string } | null)?.name;
    if (!name) continue;
    const existing = categoriesByCourse.get(courseId) ?? [];
    existing.push(name);
    categoriesByCourse.set(courseId, existing);
  }

  // --- Course Performance ---
  const coursePerformance = courses.map((c) => {
    const courseAssignments = assignments.filter((a) => a.course_id === c.id);
    const completed = courseAssignments.filter(
      (a) => a.status === "completed"
    );
    const avgCompletionDays =
      completed.length > 0
        ? Math.round(
            completed.reduce((sum, a) => {
              if (!a.completed_at || !a.assigned_at) return sum;
              const diff =
                new Date(a.completed_at).getTime() -
                new Date(a.assigned_at).getTime();
              return sum + diff / (1000 * 60 * 60 * 24);
            }, 0) / completed.length
          )
        : null;

    return {
      id: c.id,
      title: c.title,
      status: c.status,
      categories: categoriesByCourse.get(c.id) ?? [],
      totalAssigned: courseAssignments.length,
      completed: completed.length,
      inProgress: courseAssignments.filter((a) => a.status === "in_progress")
        .length,
      completionRate:
        courseAssignments.length > 0
          ? Math.round((completed.length / courseAssignments.length) * 100)
          : 0,
      avgCompletionDays,
      avgTimeSeconds: (() => {
        const t = timeByCourse.get(c.id);
        return t && t.learners > 0 ? Math.round(t.total / t.learners) : null;
      })(),
    };
  });

  // Course -> module -> lesson breakdown for the Time Spent section.
  const timeBreakdown = courses
    .map((c) => {
      const mods = (allModules ?? [])
        .filter((m) => m.course_id === c.id)
        .sort((a, b) => a.position - b.position)
        .map((m) => {
          const lessonRows = (allLessons ?? [])
            .filter((l) => l.module_id === m.id)
            .sort((a, b) => a.position - b.position)
            .map((l) => {
              const t = timeByLesson.get(l.id);
              return {
                id: l.id as string,
                title: l.title as string,
                total: t?.total ?? 0,
                learners: t?.learners ?? 0,
              };
            });
          return {
            id: m.id as string,
            title: m.title as string,
            total: lessonRows.reduce((s, l) => s + l.total, 0),
            lessons: lessonRows,
          };
        });
      const courseTime = timeByCourse.get(c.id);
      return {
        id: c.id as string,
        title: c.title as string,
        total: courseTime?.total ?? 0,
        learners: courseTime?.learners ?? 0,
        modules: mods,
      };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // --- Quiz Analytics ---
  // Group attempts by lesson_id (each quiz is a lesson)
  const quizLessonIds = [...new Set(attempts.map((a) => a.lesson_id))];
  const quizAnalytics = quizLessonIds.map((lessonId) => {
    const quizAttempts = attempts.filter((a) => a.lesson_id === lessonId);
    const quizQuestions = questions.filter((q) => q.lesson_id === lessonId);
    const avgScore =
      quizAttempts.length > 0
        ? Math.round(
            quizAttempts.reduce((s, a) => s + (a.percentage ?? 0), 0) /
              quizAttempts.length
          )
        : 0;
    const passRate =
      quizAttempts.length > 0
        ? Math.round(
            (quizAttempts.filter((a) => a.passed).length /
              quizAttempts.length) *
              100
          )
        : 0;
    const avgTime =
      quizAttempts.filter((a) => a.time_spent_seconds).length > 0
        ? Math.round(
            quizAttempts
              .filter((a) => a.time_spent_seconds)
              .reduce((s, a) => s + (a.time_spent_seconds ?? 0), 0) /
              quizAttempts.filter((a) => a.time_spent_seconds).length
          )
        : null;
    const uniqueUsers = new Set(quizAttempts.map((a) => a.user_id)).size;
    const avgAttemptsPerUser =
      uniqueUsers > 0
        ? Math.round((quizAttempts.length / uniqueUsers) * 10) / 10
        : 0;

    return {
      lessonId,
      totalAttempts: quizAttempts.length,
      uniqueUsers,
      avgAttemptsPerUser,
      avgScore,
      passRate,
      avgTimeSeconds: avgTime,
      questionCount: quizQuestions.length,
    };
  });

  // --- Question Accuracy ---
  const questionAccuracy = questions.map((q) => {
    const qAnswers = answers.filter((a) => a.question_id === q.id);
    const total = qAnswers.length;
    const correct = qAnswers.filter((a) => a.is_correct).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : null;

    return {
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      totalAnswers: total,
      correctAnswers: correct,
      incorrectAnswers: total - correct,
      accuracy,
    };
  });

  // Sort by accuracy (most incorrect first)
  const mostDifficult = [...questionAccuracy]
    .filter((q) => q.totalAnswers > 0)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100));

  const mostCorrect = [...questionAccuracy]
    .filter((q) => q.totalAnswers > 0)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));

  // --- Coding Drill Analytics ---
  const drillAttempts = allDrillAttempts ?? [];
  const lessons = allLessons ?? [];

  // Resolve a readable drill title from block_id. For lesson-type drills the
  // block_id IS the lesson id; otherwise fall back to a short id.
  const lessonTitleById = new Map(
    lessons.map((l) => [l.id as string, l.title as string])
  );
  const drillTitle = (blockId: string) =>
    lessonTitleById.get(blockId) ?? `Drill ${blockId.slice(0, 8)}`;

  // User display names.
  const userNameById = new Map(
    users.map((u) => [
      u.id,
      (u.user_metadata?.full_name as string) ?? u.email ?? "Unknown",
    ])
  );

  // Per-drill summary (grouped by block_id).
  const drillSummary = Array.from(
    drillAttempts.reduce((map, a) => {
      const key = a.block_id as string;
      const entry = map.get(key) ?? {
        blockId: key,
        attempts: 0,
        learners: new Set<string>(),
        accSum: 0,
        best: 0,
      };
      entry.attempts += 1;
      entry.learners.add(a.user_id as string);
      entry.accSum += (a.accuracy as number) ?? 0;
      entry.best = Math.max(entry.best, (a.accuracy as number) ?? 0);
      map.set(key, entry);
      return map;
    }, new Map<string, { blockId: string; attempts: number; learners: Set<string>; accSum: number; best: number }>())
    .values()
  )
    .map((d) => ({
      blockId: d.blockId,
      title: drillTitle(d.blockId),
      attempts: d.attempts,
      uniqueLearners: d.learners.size,
      avgAccuracy: d.attempts > 0 ? Math.round(d.accSum / d.attempts) : 0,
      bestAccuracy: d.best,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  // Recent attempts (most recent first) for a live feed.
  const recentDrillAttempts = [...drillAttempts]
    .sort(
      (a, b) =>
        new Date(b.created_at as string).getTime() -
        new Date(a.created_at as string).getTime()
    )
    .slice(0, 25)
    .map((a) => ({
      id: a.id as string,
      learner: userNameById.get(a.user_id as string) ?? "Unknown",
      drill: drillTitle(a.block_id as string),
      accuracy: (a.accuracy as number) ?? 0,
      exact: (a.exact as number) ?? 0,
      missed: (a.missed as number) ?? 0,
      extra: (a.extra as number) ?? 0,
      when: a.created_at as string,
    }));

  const drillTotalAttempts = drillAttempts.length;
  const drillAvgAccuracy =
    drillTotalAttempts > 0
      ? Math.round(
          drillAttempts.reduce(
            (s, a) => s + ((a.accuracy as number) ?? 0),
            0
          ) / drillTotalAttempts
        )
      : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Reports
        </h1>
        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
        <p className="mt-4 text-slate-500">
          Platform analytics and learner performance tracking.
        </p>
      </div>

      {/* Overview stats */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Users"
            value={totalUsers}
            icon={<Users size={20} />}
          />
          <StatCard
            title="Total Courses"
            value={totalCourses}
            icon={<BookOpen size={20} />}
          />
          <StatCard
            title="Completion Rate"
            value={`${overallCompletionRate}%`}
            icon={<CheckCircle2 size={20} />}
            highlight={overallCompletionRate === 100}
          />
          <StatCard
            title="Avg Quiz Score"
            value={`${avgQuizScore}%`}
            icon={<Target size={20} />}
          />
          <StatCard
            title="Assignments"
            value={totalAssignments}
            icon={<TrendingUp size={20} />}
          />
          <StatCard
            title="Completed"
            value={completedAssignments}
            icon={<Award size={20} />}
          />
          <StatCard
            title="In Progress"
            value={inProgressAssignments}
            icon={<Clock size={20} />}
          />
          <StatCard
            title="Quiz Pass Rate"
            value={`${quizPassRate}%`}
            icon={<Target size={20} />}
          />
        </div>
      </section>

      {/* User Progress */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          User Progress
        </h2>
        <UserProgressTable rows={userProgress} />
      </section>

      {/* Course Performance */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Course Performance
        </h2>
        <CoursePerformanceTable rows={coursePerformance} />
      </section>

      {/* Time Spent */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-slate-900">
          Time Spent
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          Active learning time only. Time is counted while the tab is open and
          the learner is interacting or watching a video, and stops after 90
          seconds of inactivity. Expand a course to see modules and lessons.
        </p>
        {timeBreakdown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-400">
            No time recorded yet. It starts building up as learners work
            through courses.
          </div>
        ) : (
          <div className="space-y-3">
            {timeBreakdown.map((c) => (
              <details
                key={c.id}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50/60">
                  <span className="font-medium text-slate-900">{c.title}</span>
                  <span className="flex shrink-0 items-center gap-6 text-sm text-slate-600">
                    <span>
                      Total{" "}
                      <span className="font-semibold text-slate-900">
                        {formatDuration(c.total)}
                      </span>
                    </span>
                    <span>
                      Avg per learner{" "}
                      <span className="font-semibold text-slate-900">
                        {formatDuration(
                          c.learners > 0 ? c.total / c.learners : 0
                        )}
                      </span>
                    </span>
                    <span className="text-slate-400">
                      {c.learners} learner{c.learners !== 1 ? "s" : ""}
                    </span>
                  </span>
                </summary>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-2 font-semibold">
                          Module / Lesson
                        </th>
                        <th className="px-5 py-2 font-semibold">Total</th>
                        <th className="px-5 py-2 font-semibold">Learners</th>
                        <th className="px-5 py-2 font-semibold">
                          Avg per learner
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {c.modules.map((m) => (
                        <Fragment key={m.id}>
                          <tr className="bg-slate-50/60">
                            <td className="px-5 py-2 font-semibold text-slate-800">
                              {m.title}
                            </td>
                            <td className="px-5 py-2 font-semibold text-slate-800">
                              {formatDuration(m.total)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                          {m.lessons.map((l) => (
                            <tr key={l.id}>
                              <td className="py-2 pl-10 pr-5 text-slate-700">
                                {l.title}
                              </td>
                              <td className="px-5 py-2 text-slate-700">
                                {formatDuration(l.total)}
                              </td>
                              <td className="px-5 py-2 text-slate-500">
                                {l.learners}
                              </td>
                              <td className="px-5 py-2 text-slate-700">
                                {formatDuration(
                                  l.learners > 0 ? l.total / l.learners : 0
                                )}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      {/* Quiz Analytics */}
      {quizAnalytics.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Quiz Analytics
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Quiz
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Questions
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Attempts
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Users
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Avg Attempts/User
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Avg Score
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Pass Rate
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Avg Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {quizAnalytics.map((q) => (
                    <tr key={q.lessonId} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        Quiz {q.lessonId.slice(0, 8)}...
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {q.questionCount}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {q.totalAttempts}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {q.uniqueUsers}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {q.avgAttemptsPerUser}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {q.avgScore}%
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            q.passRate >= 80
                              ? "bg-green-100 text-green-700"
                              : q.passRate >= 50
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {q.passRate}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {q.avgTimeSeconds !== null
                          ? q.avgTimeSeconds >= 60
                            ? `${Math.round(q.avgTimeSeconds / 60)}m ${q.avgTimeSeconds % 60}s`
                            : `${q.avgTimeSeconds}s`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Coding Drill Analytics */}
      {drillTotalAttempts > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Coding Drill Performance
            </h2>
            <div className="flex gap-3 text-sm text-slate-500">
              <span>
                {drillTotalAttempts} attempt
                {drillTotalAttempts !== 1 ? "s" : ""}
              </span>
              <span>
                Avg accuracy{" "}
                <span className="font-semibold text-slate-700">
                  {drillAvgAccuracy}%
                </span>
              </span>
            </div>
          </div>

          {/* Per-drill summary */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Drill
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Attempts
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Learners
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Avg Accuracy
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Best
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drillSummary.map((d) => (
                    <tr key={d.blockId} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {d.title}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {d.attempts}
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {d.uniqueLearners}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`font-semibold ${
                            d.avgAccuracy >= 90
                              ? "text-emerald-600"
                              : d.avgAccuracy >= 70
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {d.avgAccuracy}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">
                        {d.bestAccuracy}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent attempts */}
          <h3 className="mb-3 mt-6 text-sm font-semibold text-slate-700">
            Recent attempts
          </h3>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Learner
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Drill
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Accuracy
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Correct
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Missed
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      Extra
                    </th>
                    <th className="px-5 py-3 font-semibold text-slate-700">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentDrillAttempts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {a.learner}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{a.drill}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`font-semibold ${
                            a.accuracy >= 90
                              ? "text-emerald-600"
                              : a.accuracy >= 70
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {a.accuracy}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-emerald-700">{a.exact}</td>
                      <td className="px-5 py-3 text-red-500">{a.missed}</td>
                      <td className="px-5 py-3 text-red-500">{a.extra}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                        {new Date(a.when).toLocaleDateString(undefined, {
                          day: "2-digit",
                          month: "short",
                        })}{" "}
                        {new Date(a.when).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Question Accuracy — Most Difficult */}
      {mostDifficult.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <AlertCircle size={20} className="text-red-500" />
              Most Difficult Questions
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              {mostDifficult.slice(0, 10).map((q) => (
                <div
                  key={q.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {q.question_text || "Untitled question"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {q.incorrectAnswers} incorrect of {q.totalAnswers} answers
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    {q.accuracy}% correct
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <CheckCircle2 size={20} className="text-green-500" />
              Easiest Questions
            </h2>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              {mostCorrect.slice(0, 10).map((q) => (
                <div
                  key={q.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {q.question_text || "Untitled question"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {q.correctAnswers} correct of {q.totalAnswers} answers
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                    {q.accuracy}% correct
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
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
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p
            className={`mt-2 text-2xl font-bold ${
              highlight ? "text-green-600" : "text-slate-900"
            }`}
          >
            {value}
          </p>
        </div>
        <div
          className={`rounded-xl p-2.5 ${
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
