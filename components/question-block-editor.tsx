"use client";

import { useState } from "react";
import { Check, Image as ImageIcon, Plus, X } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { VideoUpload } from "@/components/video-upload";
import {
  parseQuestionConfig,
  serializeQuestionConfig,
  type QuestionConfig,
  type QuestionGate,
  type QuestionOption,
  type QuestionType,
} from "@/lib/question-block";

type Props = {
  /** the block's serialized content */
  value: string;
  onChange: (serialized: string) => void;
  lessonId: string;
};

const GATE_OPTIONS: { value: QuestionGate; label: string; hint: string }[] = [
  {
    value: "answered",
    label: "Must be answered",
    hint: "Learners must submit an answer (right or wrong) before they can continue.",
  },
  {
    value: "correct",
    label: "Must be answered correctly",
    hint: "Learners can retry until they get it right before they can continue.",
  },
  {
    value: "none",
    label: "Optional",
    hint: "Learners can skip this question and continue.",
  },
];

/** Admin editor for a one-off question on a lesson page (mirrors the quiz editor). */
export function QuestionBlockEditor({ value, onChange, lessonId }: Props) {
  const [config, setConfig] = useState<QuestionConfig>(() =>
    parseQuestionConfig(value)
  );
  // Which option's image uploader is open (null = none).
  const [imageOptionIdx, setImageOptionIdx] = useState<number | null>(null);

  function commit(next: QuestionConfig) {
    setConfig(next);
    onChange(serializeQuestionConfig(next));
  }

  function setType(type: QuestionType) {
    if (type === config.question_type) return;
    let options = config.options;
    if (type === "single_choice") {
      // keep at most one correct answer
      let seen = false;
      options = options.map((o) => {
        if (o.is_correct && !seen) {
          seen = true;
          return o;
        }
        return { ...o, is_correct: false };
      });
    }
    if (type === "short_answer") {
      // every listed option is an accepted answer
      options = options.map((o) => ({
        ...o,
        is_correct: true,
        image_url: null,
      }));
    } else if (config.question_type === "short_answer") {
      options = options.map((o) => ({ ...o, is_correct: false }));
    }
    commit({ ...config, question_type: type, options });
  }

  function updateOption(idx: number, updates: Partial<QuestionOption>) {
    const options = config.options.map((o, i) =>
      i === idx ? { ...o, ...updates } : o
    );
    if (updates.is_correct && config.question_type === "single_choice") {
      options.forEach((o, i) => {
        if (i !== idx) o.is_correct = false;
      });
    }
    commit({ ...config, options });
  }

  function addOption() {
    commit({
      ...config,
      options: [
        ...config.options,
        {
          id: crypto.randomUUID(),
          content: "",
          is_correct: config.question_type === "short_answer",
        },
      ],
    });
  }

  function removeOption(idx: number) {
    commit({
      ...config,
      options: config.options.filter((_, i) => i !== idx),
    });
  }

  const isShort = config.question_type === "short_answer";
  const minOptions = isShort ? 1 : 2;
  const gate = GATE_OPTIONS.find((g) => g.value === config.gate);

  return (
    <div className="space-y-5">
      {/* Type + progression rule */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={config.question_type}
          onChange={(e) => setType(e.target.value as QuestionType)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
        >
          <option value="single_choice">Single Choice</option>
          <option value="multiple_choice">Multiple Choice</option>
          <option value="short_answer">Short Answer</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-500">To continue:</label>
          <select
            value={config.gate}
            onChange={(e) =>
              commit({ ...config, gate: e.target.value as QuestionGate })
            }
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
          >
            {GATE_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {gate && <p className="-mt-3 text-[11px] text-slate-400">{gate.hint}</p>}

      {/* Media */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Media (optional)
        </label>
        <div className="mb-2 flex gap-2">
          {(["image", "video"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => commit({ ...config, media_type: t })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition ${
                (config.media_type ?? "image") === t
                  ? "bg-pd-red/10 text-pd-red"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {(config.media_type ?? "image") === "image" ? (
          <ImageUpload
            value={config.media_url ?? ""}
            onChange={(url) =>
              commit({ ...config, media_url: url || null, media_type: "image" })
            }
            lessonId={lessonId}
          />
        ) : (
          <VideoUpload
            value={config.media_url ?? ""}
            onChange={(url) =>
              commit({ ...config, media_url: url || null, media_type: "video" })
            }
          />
        )}
      </div>

      {/* Question text */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Question
        </label>
        <textarea
          value={config.question_text}
          onChange={(e) => commit({ ...config, question_text: e.target.value })}
          rows={3}
          placeholder="Type your question here..."
          className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
        />
      </div>

      {/* Answers */}
      <div>
        <label className="mb-2 block text-xs font-medium text-slate-500">
          {isShort ? "Accepted answers" : "Answers"}{" "}
          <span className="text-slate-400">
            (
            {isShort
              ? "not case sensitive, any one of these is correct"
              : config.question_type === "single_choice"
                ? "tick the correct answer"
                : "tick all correct answers"}
            )
          </span>
        </label>

        <div className="space-y-3">
          {config.options.map((opt, idx) => (
            <div
              key={opt.id}
              className="rounded-xl border border-slate-200 bg-white p-2.5"
            >
              <div className="flex items-center gap-2">
                {!isShort && (
                  <button
                    type="button"
                    onClick={() =>
                      updateOption(idx, { is_correct: !opt.is_correct })
                    }
                    title="Mark as correct"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                      opt.is_correct
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-slate-300 hover:border-slate-400"
                    }`}
                  >
                    {opt.is_correct && <Check size={14} />}
                  </button>
                )}

                <input
                  type="text"
                  value={opt.content}
                  onChange={(e) =>
                    updateOption(idx, { content: e.target.value })
                  }
                  placeholder={isShort ? `Answer ${idx + 1}` : `Option ${idx + 1}`}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-pd-red"
                />

                {!isShort && (
                  <button
                    type="button"
                    onClick={() =>
                      setImageOptionIdx(imageOptionIdx === idx ? null : idx)
                    }
                    title={opt.image_url ? "Edit image" : "Add image"}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
                      opt.image_url || imageOptionIdx === idx
                        ? "border-pd-red bg-pd-red/10 text-pd-red"
                        : "border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-white"
                    }`}
                  >
                    <ImageIcon size={15} />
                  </button>
                )}

                {config.options.length > minOptions && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {!isShort && opt.image_url && imageOptionIdx !== idx && (
                <div className="mt-2 flex items-center gap-2 pl-8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={opt.image_url}
                    alt={`Option ${idx + 1}`}
                    className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => updateOption(idx, { image_url: null })}
                    className="text-xs font-medium text-slate-500 hover:text-red-600"
                  >
                    Remove image
                  </button>
                </div>
              )}

              {!isShort && imageOptionIdx === idx && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                  <ImageUpload
                    value={opt.image_url ?? ""}
                    onChange={(url) =>
                      updateOption(idx, { image_url: url || null })
                    }
                    lessonId={lessonId}
                  />
                  <button
                    type="button"
                    onClick={() => setImageOptionIdx(null)}
                    className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addOption}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-pd-red hover:text-pd-red-hover"
        >
          <Plus size={14} />
          {isShort ? "Add accepted answer" : "Add option"}
        </button>
      </div>

      {/* Feedback */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Feedback message{" "}
          <span className="text-slate-400">(shown after user answers)</span>
        </label>
        <textarea
          value={config.explanation ?? ""}
          onChange={(e) =>
            commit({ ...config, explanation: e.target.value || null })
          }
          rows={3}
          placeholder="e.g. Explain why the correct answer is right..."
          className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-pd-red"
        />
      </div>
    </div>
  );
}
