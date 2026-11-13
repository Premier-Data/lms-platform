"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { fetchCourseMap, tx } from "@/lib/translations";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  RotateCcw,
  ChevronRight,
  Loader2,
  Play,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QuestionMedia } from "@/components/question-media";

// --- Types ---

type Option = {
  id: string;
  content: string;
  is_correct: boolean;
  position: number;
  image_url?: string | null;
};

type Question = {
  id: string;
  lesson_id: string;
  position: number;
  question_text: string;
  question_type: string;
  media_url: string | null;
  media_type: string | null;
  points: number;
  explanation: string | null;
  quiz_options: Option[];
};

type QuizConfig = {
  id: string;
  lesson_id: string;
  pass_mark: number;
  time_limit_seconds: number | null;
  randomize: boolean;
  max_attempts: number | null;
  intro_title: string | null;
  intro_message: string | null;
  end_title: string | null;
  end_message: string | null;
};

type QuizTakerProps = {
  /** course this quiz belongs to (used to look up translations) */
  courseId?: string;
  lessonId: string;
  lessonTitle: string;
  onComplete: (passed: boolean) => void;
};

type AnswerState = {
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string;
};

type Phase = "loading" | "intro" | "question" | "feedback" | "results";

// --- Attempt randomisation ---

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// True/False reads oddly when flipped, so keep that order.
function isTrueFalse(options: Option[]): boolean {
  return (
    options.length === 2 &&
    options.every((o) =>
      /^(true|false|\u0111\u00fang|sai)$/i.test(o.content.trim())
    )
  );
}

/**
 * A fresh random version of the quiz for one attempt: question order and
 * answer-option order are both shuffled, so a learner cannot just remember
 * "the answer is the 3rd one" between attempts.
 */
function buildAttempt(qs: Question[]): Question[] {
  return shuffle(qs).map((q) =>
    q.question_type === "short_answer" || isTrueFalse(q.quiz_options)
      ? q
      : { ...q, quiz_options: shuffle(q.quiz_options) }
  );
}

// --- Component ---

export function QuizTaker({
  courseId,
  lessonId,
  lessonTitle,
  onComplete,
}: QuizTakerProps) {
  const t = useTranslations("quiz");
  const locale = useLocale();
  const supabase = createClient();

  const [phase, setPhase] = useState<Phase>("loading");
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState<AnswerState>({
    questionId: "",
    selectedOptionIds: [],
    textAnswer: "",
  });
  const [isCurrentCorrect, setIsCurrentCorrect] = useState<boolean | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  // Results
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [passed, setPassed] = useState(false);

  // Timer
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Attempts tracking
  const [previousAttempts, setPreviousAttempts] = useState(0);
  const [alreadyPassed, setAlreadyPassed] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);

  // Load quiz data
  useEffect(() => {
    async function load() {
      const [configRes, questionsRes, attemptsRes] = await Promise.all([
        supabase
          .from("quiz_config")
          .select("*")
          .eq("lesson_id", lessonId)
          .maybeSingle(),
        supabase
          .from("quiz_questions")
          .select("*, quiz_options(*)")
          .eq("lesson_id", lessonId)
          .order("position", { ascending: true }),
        supabase
          .from("quiz_attempts")
          .select("id, percentage, passed")
          .eq("lesson_id", lessonId),
      ]);

      // Vietnamese wording where a translation exists (grading uses ids, so
      // it is unaffected).
      const tmap = courseId
        ? await fetchCourseMap(supabase, courseId, locale)
        : null;

      if (configRes.data) {
        const c = configRes.data;
        setConfig({
          ...c,
          intro_title: tx(tmap, "quiz_config", c.id, "intro_title", c.intro_title),
          intro_message: tx(tmap, "quiz_config", c.id, "intro_message", c.intro_message),
          end_title: tx(tmap, "quiz_config", c.id, "end_title", c.end_title),
          end_message: tx(tmap, "quiz_config", c.id, "end_message", c.end_message),
        });
      }

      const qs = (questionsRes.data ?? []).map((q) => ({
        ...q,
        question_text: tx(tmap, "quiz_question", q.id, "question_text", q.question_text),
        explanation: tx(tmap, "quiz_question", q.id, "explanation", q.explanation),
        quiz_options: (q.quiz_options ?? [])
          .map((o: Option) =>
            q.question_type === "short_answer"
              ? o
              : { ...o, content: tx(tmap, "quiz_option", o.id, "content", o.content) }
          )
          .sort((a: Option, b: Option) => a.position - b.position),
      }));
      setQuestions(qs);

      // Check previous attempts
      const attempts = attemptsRes.data ?? [];
      setPreviousAttempts(attempts.length);
      const passingAttempt = attempts.find((a) => a.passed);
      if (passingAttempt) {
        setAlreadyPassed(true);
        setBestScore(
          Math.max(...attempts.map((a) => a.percentage))
        );
      }

      setPhase(
        passingAttempt ? "results" : qs.length > 0 ? "intro" : "results"
      );
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, locale]);

  // The shuffled question set for the current attempt (re-shuffled on every
  // start / retry, always).
  const [orderedQuestions, setOrderedQuestions] = useState<Question[]>([]);

  const currentQuestion = orderedQuestions[currentIndex] ?? null;

  // Timer logic
  useEffect(() => {
    if (phase !== "question" && phase !== "feedback") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    if (timeRemaining === null) return;

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          // Time's up — auto-submit
          clearInterval(timerRef.current!);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeRemaining !== null]);

  // Start the quiz
  function startQuiz() {
    const attempt = buildAttempt(questions);
    setOrderedQuestions(attempt);
    setCurrentIndex(0);
    setAnswers([]);
    setCurrentAnswer({
      questionId: attempt[0]?.id ?? "",
      selectedOptionIds: [],
      textAnswer: "",
    });
    setIsCurrentCorrect(null);
    setStartedAt(new Date());

    if (config?.time_limit_seconds) {
      setTimeRemaining(config.time_limit_seconds);
    }

    setPhase("question");
  }

  // Check if the current answer is correct
  function gradeCurrentAnswer(): boolean {
    if (!currentQuestion) return false;

    if (currentQuestion.question_type === "short_answer") {
      // Flexible: check if the text matches any correct option (case-insensitive, trimmed)
      const correctOptions = currentQuestion.quiz_options.filter(
        (o) => o.is_correct
      );
      const userText = currentAnswer.textAnswer.trim().toLowerCase();
      return correctOptions.some(
        (o) => o.content.trim().toLowerCase() === userText
      );
    }

    if (currentQuestion.question_type === "single_choice") {
      const correctOption = currentQuestion.quiz_options.find(
        (o) => o.is_correct
      );
      return (
        currentAnswer.selectedOptionIds.length === 1 &&
        currentAnswer.selectedOptionIds[0] === correctOption?.id
      );
    }

    if (currentQuestion.question_type === "multiple_choice") {
      const correctIds = new Set(
        currentQuestion.quiz_options.filter((o) => o.is_correct).map((o) => o.id)
      );
      const selectedIds = new Set(currentAnswer.selectedOptionIds);
      if (correctIds.size !== selectedIds.size) return false;
      for (const id of correctIds) {
        if (!selectedIds.has(id)) return false;
      }
      return true;
    }

    return false;
  }

  // Submit current answer and show feedback
  function submitAnswer() {
    const correct = gradeCurrentAnswer();
    setIsCurrentCorrect(correct);

    const answeredState: AnswerState = { ...currentAnswer };
    setAnswers((prev) => [...prev, answeredState]);

    setPhase("feedback");
  }

  // Move to next question or finish
  function continueAfterFeedback() {
    const nextIndex = currentIndex + 1;

    if (nextIndex >= orderedQuestions.length) {
      // Quiz finished — grade and submit
      finalizeQuiz();
    } else {
      setCurrentIndex(nextIndex);
      setCurrentAnswer({
        questionId: orderedQuestions[nextIndex].id,
        selectedOptionIds: [],
        textAnswer: "",
      });
      setIsCurrentCorrect(null);
      setPhase("question");
    }
  }

  // Handle time running out
  // Always calls the latest finalizeQuiz (the timer interval would otherwise
  // hold a stale copy with no questions or answers).
  const finalizeRef = useRef<() => void>(() => {});
  useEffect(() => {
    finalizeRef.current = finalizeQuiz;
  });
  function handleTimeUp() {
    // Submit whatever has been answered so far
    finalizeRef.current();
  }

  // Finalize quiz: calculate score, write to DB
  async function finalizeQuiz() {
    setSubmitting(true);

    // Include current answer if we're mid-question (timer expired)
    const allAnswers =
      phase === "question" ? [...answers, currentAnswer] : answers;

    // Grade all answers
    let totalScore = 0;
    let totalMaxScore = 0;
    const gradedAnswers: {
      questionId: string;
      selectedOptionId: string | null;
      textAnswer: string | null;
      isCorrect: boolean;
    }[] = [];

    for (const q of orderedQuestions) {
      totalMaxScore += q.points;
      const ans = allAnswers.find((a) => a.questionId === q.id);

      let isCorrect = false;

      if (ans) {
        if (q.question_type === "short_answer") {
          const correctOptions = q.quiz_options.filter((o) => o.is_correct);
          const userText = ans.textAnswer.trim().toLowerCase();
          isCorrect = correctOptions.some(
            (o) => o.content.trim().toLowerCase() === userText
          );
        } else if (q.question_type === "single_choice") {
          const correctOption = q.quiz_options.find((o) => o.is_correct);
          isCorrect =
            ans.selectedOptionIds.length === 1 &&
            ans.selectedOptionIds[0] === correctOption?.id;
        } else if (q.question_type === "multiple_choice") {
          const correctIds = new Set(
            q.quiz_options.filter((o) => o.is_correct).map((o) => o.id)
          );
          const selectedIds = new Set(ans.selectedOptionIds);
          isCorrect =
            correctIds.size === selectedIds.size &&
            [...correctIds].every((id) => selectedIds.has(id));
        }
      }

      if (isCorrect) totalScore += q.points;

      gradedAnswers.push({
        questionId: q.id,
        selectedOptionId: ans?.selectedOptionIds[0] ?? null,
        textAnswer: ans?.textAnswer || null,
        isCorrect,
      });
    }

    const pct =
      totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;
    const didPass = pct >= (config?.pass_mark ?? 80);

    setScore(totalScore);
    setMaxScore(totalMaxScore);
    setPercentage(pct);
    setPassed(didPass);

    const completedAt = new Date();
    const timeSpent = startedAt
      ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
      : null;

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Write attempt
      const { data: attempt } = await supabase
        .from("quiz_attempts")
        .insert({
          lesson_id: lessonId,
          user_id: user.id,
          score: totalScore,
          max_score: totalMaxScore,
          percentage: pct,
          passed: didPass,
          started_at: startedAt?.toISOString() ?? completedAt.toISOString(),
          completed_at: completedAt.toISOString(),
          time_spent_seconds: timeSpent,
        })
        .select("id")
        .single();

      if (attempt) {
        // Write individual answers
        const answerRows = gradedAnswers.map((a) => ({
          attempt_id: attempt.id,
          question_id: a.questionId,
          selected_option_id: a.selectedOptionId,
          text_answer: a.textAnswer,
          is_correct: a.isCorrect,
        }));

        await supabase.from("quiz_answers").insert(answerRows);
      }
    }

    setPreviousAttempts((p) => p + 1);
    if (didPass) {
      setAlreadyPassed(true);
      onComplete(true);
    }

    setSubmitting(false);
    setPhase("results");
  }

  // Option selection handlers
  function selectOption(optionId: string) {
    if (!currentQuestion) return;

    if (currentQuestion.question_type === "single_choice") {
      setCurrentAnswer({ ...currentAnswer, selectedOptionIds: [optionId] });
    } else {
      // Multiple choice — toggle
      setCurrentAnswer((prev) => {
        const ids = prev.selectedOptionIds.includes(optionId)
          ? prev.selectedOptionIds.filter((id) => id !== optionId)
          : [...prev.selectedOptionIds, optionId];
        return { ...prev, selectedOptionIds: ids };
      });
    }
  }

  const hasAnswered =
    currentQuestion?.question_type === "short_answer"
      ? currentAnswer.textAnswer.trim().length > 0
      : currentAnswer.selectedOptionIds.length > 0;

  const canRetry =
    config?.max_attempts === null ||
    config?.max_attempts === undefined ||
    previousAttempts < (config?.max_attempts ?? Infinity);

  // Format timer
  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // --- Render ---

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  // INTRO
  if (phase === "intro") {
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pd-red/10">
            <Play size={28} className="text-pd-red" />
          </div>

          <h2 className="mt-5 text-2xl font-bold text-slate-900">
            {config?.intro_title || lessonTitle}
          </h2>

          {config?.intro_message && (
            <p className="mt-3 text-sm text-slate-500">
              {config.intro_message}
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              {t.rich("questionCount", {
                n: questions.length,
                b: (c) => <span className="font-semibold">{c}</span>,
              })}
            </span>
            <span className="flex items-center gap-1.5">
              {t.rich("passMark", {
                n: config?.pass_mark ?? 80,
                b: (c) => <span className="font-semibold">{c}</span>,
              })}
            </span>
            {config?.time_limit_seconds && (
              <span className="flex items-center gap-1.5">
                <Clock size={15} />
                {formatTime(config.time_limit_seconds)}
              </span>
            )}
          </div>

          {previousAttempts > 0 && (
            <p className="mt-4 text-xs text-slate-400">
              {t("attemptsMade", { n: previousAttempts })}
            </p>
          )}

          <button
            onClick={startQuiz}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-pd-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-pd-red-hover"
          >
            <Play size={18} />
            {t("start")}
          </button>
        </div>
      </div>
    );
  }

  // QUESTION
  if (phase === "question" && currentQuestion) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        {/* Header: progress + timer */}
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">
            {t("questionOf", {
              n: currentIndex + 1,
              total: orderedQuestions.length,
            })}
          </span>
          {timeRemaining !== null && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                timeRemaining <= 30
                  ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <Clock size={15} />
              {formatTime(timeRemaining)}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-pd-red transition-all"
            style={{
              width: `${((currentIndex + 1) / orderedQuestions.length) * 100}%`,
            }}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          {/* Media */}
          {currentQuestion.media_url && (
            <div className="mb-6 overflow-hidden rounded-xl">
              <QuestionMedia
                url={currentQuestion.media_url}
                type={currentQuestion.media_type}
              />
            </div>
          )}

          {/* Question text */}
          <h3 className="text-lg font-semibold text-slate-900">
            {currentQuestion.question_text}
          </h3>

          {/* Answer input */}
          <div className="mt-6">
            {currentQuestion.question_type === "short_answer" ? (
              <input
                type="text"
                value={currentAnswer.textAnswer}
                onChange={(e) =>
                  setCurrentAnswer({
                    ...currentAnswer,
                    textAnswer: e.target.value,
                  })
                }
                placeholder={t("typeAnswer")}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
              />
            ) : (
              <div className="space-y-3">
                {currentQuestion.quiz_options.map((opt) => {
                  const selected =
                    currentAnswer.selectedOptionIds.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectOption(opt.id)}
                      className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition ${
                        selected
                          ? "border-pd-red bg-pd-red/5 font-medium text-pd-red"
                          : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          selected
                            ? "border-pd-red bg-pd-red"
                            : "border-slate-300"
                        }`}
                      >
                        {selected && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>
                      <span className="flex-1">
                        {opt.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={opt.image_url}
                            alt={opt.content || t("answerOption")}
                            className="mb-2 max-h-48 w-full rounded-lg object-contain"
                          />
                        )}
                        {opt.content && <span>{opt.content}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Submit answer */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={submitAnswer}
              disabled={!hasAnswered}
              className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("submitAnswer")}
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // FEEDBACK (after each question)
  if (phase === "feedback" && currentQuestion) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        {/* Header: progress + timer (still ticking) */}
        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-500">
            {t("questionOf", {
              n: currentIndex + 1,
              total: orderedQuestions.length,
            })}
          </span>
          {timeRemaining !== null && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                timeRemaining <= 30
                  ? "bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <Clock size={15} />
              {formatTime(timeRemaining)}
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          {/* Correct / Incorrect banner */}
          <div
            className={`mb-6 flex items-center gap-3 rounded-xl p-4 ${
              isCurrentCorrect
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {isCurrentCorrect ? (
              <CheckCircle2 size={24} className="text-green-600" />
            ) : (
              <XCircle size={24} className="text-red-600" />
            )}
            <span className="text-lg font-semibold">
              {isCurrentCorrect ? t("correct") : t("incorrect")}
            </span>
          </div>

          {/* Explanation / feedback message */}
          {currentQuestion.explanation && (
            <div className="mb-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              {currentQuestion.explanation}
            </div>
          )}

          {/* Show the correct answer if wrong */}
          {!isCurrentCorrect &&
            currentQuestion.question_type !== "short_answer" && (
              <div className="mb-6">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {t("correctAnswer")}
                </p>
                <div className="mt-2 space-y-1">
                  {currentQuestion.quiz_options
                    .filter((o) => o.is_correct)
                    .map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center gap-2 text-sm font-medium text-green-700"
                      >
                        <CheckCircle2 size={16} className="shrink-0" />
                        {o.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={o.image_url}
                            alt={o.content || t("correctAnswerAlt")}
                            className="h-12 w-12 rounded-lg border border-green-200 object-cover"
                          />
                        )}
                        {o.content && <span>{o.content}</span>}
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* Continue button */}
          <div className="flex justify-end">
            <button
              onClick={continueAfterFeedback}
              className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-pd-red-hover"
            >
              {currentIndex + 1 >= orderedQuestions.length
                ? t("seeResults")
                : t("continue")}
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RESULTS
  if (phase === "results") {
    // Already passed (from a previous attempt)
    if (alreadyPassed && !submitting && percentage === 0 && bestScore !== null) {
      return (
        <div className="mx-auto max-w-lg py-12 text-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
              <Trophy size={28} className="text-green-600" />
            </div>

            <h2 className="mt-5 text-2xl font-bold text-slate-900">
              {t("completedTitle")}
            </h2>

            <p className="mt-3 text-slate-500">
              {t.rich("alreadyPassed", {
                n: bestScore,
                b: (c) => (
                  <span className="font-semibold text-green-700">{c}</span>
                ),
              })}
            </p>

            <div className="mt-6 flex justify-center gap-3">
              {canRetry && (
                <button
                  onClick={startQuiz}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <RotateCcw size={16} />
                  {t("retake")}
                </button>
              )}
              <button
                onClick={() => onComplete(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover"
              >
                {t("continue")}
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Fresh results after submitting
    return (
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          {submitting ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-slate-400" size={28} />
            </div>
          ) : (
            <>
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${
                  passed ? "bg-green-100" : "bg-red-100"
                }`}
              >
                {passed ? (
                  <Trophy size={28} className="text-green-600" />
                ) : (
                  <XCircle size={28} className="text-red-600" />
                )}
              </div>

              <h2 className="mt-5 text-2xl font-bold text-slate-900">
                {config?.end_title ||
                  (passed ? t("passedTitle") : t("notPassedTitle"))}
              </h2>

              {config?.end_message && (
                <p className="mt-3 text-sm text-slate-500">
                  {config.end_message}
                </p>
              )}

              <div className="mt-6 rounded-xl bg-slate-50 p-5">
                <p className="text-4xl font-bold text-slate-900">
                  {percentage}%
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {t("points", { score, max: maxScore })}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {t("passMarkPlain", { n: config?.pass_mark ?? 80 })}
                </p>
              </div>

              <div
                className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                  passed
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {passed ? (
                  <>
                    <CheckCircle2 size={16} />
                    {t("passed")}
                  </>
                ) : (
                  <>
                    <XCircle size={16} />
                    {t("notPassed")}
                  </>
                )}
              </div>

              <div className="mt-8 flex justify-center gap-3">
                {!passed && canRetry && (
                  <button
                    onClick={startQuiz}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <RotateCcw size={16} />
                    {t("retry")}
                  </button>
                )}

                {!passed && canRetry && (
                  <p className="w-full text-sm text-slate-500">
                    {t("retryHint", { n: config?.pass_mark ?? 80 })}
                  </p>
                )}

                {!passed && !canRetry && (
                  <p className="text-sm text-red-600">
                    {t("noRetries")}
                  </p>
                )}

                {passed && (
                  <button
                    onClick={() => onComplete(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover"
                  >
                    {t("continue")}
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
