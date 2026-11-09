"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, RotateCcw, XCircle } from "lucide-react";
import {
  gradeQuestion,
  parseQuestionConfig,
  type QuestionAnswer,
} from "@/lib/question-block";

type Props = {
  /** the block's serialized content */
  content: string | null;
  /** the learner's previously submitted answer, if any */
  savedAnswer?: QuestionAnswer;
  /** called when the learner submits. Omit for a preview (answer stays local). */
  onAnswer?: (answer: QuestionAnswer) => void;
};

/** Learner-facing one-off question, styled like a quiz question. */
export function QuestionBlockPlayer({ content, savedAnswer, onAnswer }: Props) {
  const config = parseQuestionConfig(content);

  const [selected, setSelected] = useState<string[]>(
    savedAnswer?.selected ?? []
  );
  const [text, setText] = useState(savedAnswer?.text ?? "");
  const [result, setResult] = useState<QuestionAnswer | null>(
    savedAnswer ?? null
  );

  const isShort = config.question_type === "short_answer";
  const submitted = result !== null;
  // "answered" questions lock after submitting; others allow another go.
  const canRetry = submitted && !result.correct && config.gate !== "answered";
  // Don't give away the answer while the learner is expected to retry.
  const revealAnswers =
    submitted && !result.correct && config.gate !== "correct";

  const hasAnswer = isShort ? text.trim().length > 0 : selected.length > 0;

  function toggle(id: string) {
    if (submitted) return;
    if (config.question_type === "single_choice") {
      setSelected([id]);
    } else {
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    }
  }

  function submit() {
    if (!hasAnswer || submitted) return;
    const answer = { selected: isShort ? [] : selected, text };
    const next: QuestionAnswer = {
      ...answer,
      correct: gradeQuestion(config, answer),
    };
    setResult(next);
    onAnswer?.(next);
  }

  function retry() {
    setResult(null);
    setSelected([]);
    setText("");
  }

  if (!config.question_text.trim() && config.options.every((o) => !o.content)) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center text-sm text-slate-400">
        This question hasn&apos;t been written yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      {config.media_url && (
        <div className="mb-5 overflow-hidden rounded-xl">
          {config.media_type === "video" ? (
            <video src={config.media_url} controls className="w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={config.media_url} alt="" className="w-full object-cover" />
          )}
        </div>
      )}

      <h3 className="text-lg font-semibold text-slate-900">
        {config.question_text}
      </h3>
      {config.question_type === "multiple_choice" && (
        <p className="mt-1 text-xs text-slate-400">Select all that apply.</p>
      )}

      <div className="mt-5">
        {isShort ? (
          <input
            type="text"
            value={text}
            disabled={submitted}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Type your answer..."
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red disabled:bg-slate-50"
          />
        ) : (
          <div className="space-y-3">
            {config.options.map((opt) => {
              if (!opt.content && !opt.image_url) return null;
              const isSelected = selected.includes(opt.id);
              const showCorrect = revealAnswers && opt.is_correct;
              const multi = config.question_type === "multiple_choice";
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={submitted}
                  onClick={() => toggle(opt.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition disabled:cursor-default ${
                    showCorrect
                      ? "border-green-500 bg-green-50 text-green-800"
                      : isSelected
                        ? "border-pd-red bg-pd-red/5 font-medium text-pd-red"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                      multi ? "rounded-md" : "rounded-full"
                    } ${
                      isSelected
                        ? "border-pd-red bg-pd-red"
                        : "border-slate-300"
                    }`}
                  >
                    {isSelected && (
                      <span
                        className={`h-2 w-2 bg-white ${
                          multi ? "rounded-sm" : "rounded-full"
                        }`}
                      />
                    )}
                  </span>
                  <span className="flex-1">
                    {opt.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={opt.image_url}
                        alt={opt.content || "Answer option"}
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

      {!submitted && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={!hasAnswer}
            className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit Answer
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {submitted && (
        <div className="mt-6 space-y-3">
          <div
            className={`flex items-center gap-3 rounded-xl p-4 ${
              result.correct
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {result.correct ? (
              <CheckCircle2 size={22} className="text-green-600" />
            ) : (
              <XCircle size={22} className="text-red-600" />
            )}
            <span className="font-semibold">
              {result.correct
                ? "Correct!"
                : config.gate === "correct"
                  ? "Not quite. Try again to continue."
                  : "Incorrect"}
            </span>
            {canRetry && (
              <button
                type="button"
                onClick={retry}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-current px-3 py-1.5 text-xs font-semibold"
              >
                <RotateCcw size={13} />
                Try again
              </button>
            )}
          </div>

          {config.explanation && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              {config.explanation}
            </div>
          )}

          {revealAnswers && isShort && (
            <p className="text-sm text-slate-600">
              Accepted answer
              {config.options.filter((o) => o.content.trim()).length !== 1
                ? "s"
                : ""}
              :{" "}
              <span className="font-medium text-green-700">
                {config.options
                  .map((o) => o.content.trim())
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
