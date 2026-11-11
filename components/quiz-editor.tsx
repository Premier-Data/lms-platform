"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Check,
  Loader2,
  Settings,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { VideoUpload } from "@/components/video-upload";

type Option = {
  id?: string;
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

type QuizEditorProps = {
  lessonId: string;
  lessonTitle: string;
};

export function QuizEditor({ lessonId, lessonTitle }: QuizEditorProps) {
  const [config, setConfig] = useState<QuizConfig | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  // Load quiz data
  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/admin/quiz?lesson_id=${lessonId}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setQuestions(data.questions ?? []);
        if (data.questions?.length > 0) {
          setActiveQuestionId(data.questions[0].id);
        }
      }
      setLoading(false);
    }
    load();
  }, [lessonId]);

  const activeQuestion = questions.find((q) => q.id === activeQuestionId);

  // Save config
  async function saveConfig(updates: Partial<QuizConfig>) {
    const updated = { ...config, ...updates, lesson_id: lessonId };
    const res = await fetch("/api/admin/quiz", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (res.ok) {
      const data = await res.json();
      setConfig(data.config);
      // Unpublish course on edit
      fetch("/api/admin/unpublish-on-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId }),
      });
    }
  }

  // Add a new question
  async function addQuestion() {
    setSaving(true);
    const res = await fetch("/api/admin/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lesson_id: lessonId,
        position: questions.length,
        question_text: "",
        question_type: "single_choice",
        options: [
          { content: "", is_correct: false },
          { content: "", is_correct: false },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuestions((prev) => [...prev, data.question]);
      setActiveQuestionId(data.question.id);
    }
    setSaving(false);
  }

  // Save the current question
  const saveQuestion = useCallback(
    async (question: Question) => {
      setSaving(true);
      setError("");
      const res = await fetch("/api/admin/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: question.id,
          lesson_id: lessonId,
          position: question.position,
          question_text: question.question_text,
          question_type: question.question_type,
          media_url: question.media_url,
          media_type: question.media_type,
          points: question.points,
          explanation: question.explanation,
          options: question.quiz_options.map((o) => ({
            content: o.content,
            is_correct: o.is_correct,
            image_url: o.image_url ?? null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuestions((prev) =>
          prev.map((q) => (q.id === data.question.id ? data.question : q))
        );
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
        // Unpublish course on edit
        fetch("/api/admin/unpublish-on-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lesson_id: lessonId }),
        });
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save question");
      }
      setSaving(false);
    },
    [lessonId]
  );

  // Delete a question
  async function deleteQuestion(questionId: string) {
    const res = await fetch(
      `/api/admin/quiz?question_id=${questionId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setQuestions((prev) => prev.filter((q) => q.id !== questionId));
      if (activeQuestionId === questionId) {
        setActiveQuestionId(questions[0]?.id ?? null);
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[260px_1fr_300px] gap-0 rounded-2xl border border-slate-200 bg-white" style={{ height: "700px" }}>
      {/* Left: Question list */}
      <div className="flex flex-col border-r border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">Questions</h3>
          <p className="text-xs text-slate-400">
            {questions.length} question{questions.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setActiveQuestionId(q.id)}
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                q.id === activeQuestionId
                  ? "bg-pd-red/10 font-medium text-pd-red"
                  : "text-slate-600 hover:bg-white"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-bold text-slate-600">
                {idx + 1}
              </span>
              <span className="truncate">
                {q.question_text || "Untitled question"}
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-slate-200 p-3">
          <button
            onClick={addQuestion}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-pd-red px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
          >
            <Plus size={16} />
            Add question
          </button>
        </div>
      </div>

      {/* Center: Question editor */}
      <div className="flex flex-col overflow-y-auto">
        {!activeQuestion ? (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            {questions.length === 0
              ? "Add your first question to get started."
              : "Select a question to edit."}
          </div>
        ) : (
          <QuestionForm
            key={activeQuestion.id}
            question={activeQuestion}
            onSave={saveQuestion}
            onDelete={() => deleteQuestion(activeQuestion.id)}
            saving={saving}
          />
        )}
        {error && (
          <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* Right: Settings panel */}
      <div className="flex flex-col border-l border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Settings size={15} />
            Quiz Settings
          </h3>
        </div>

        {config && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-5">
              {/* Intro slide */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Intro Slide
                </p>
                <input
                  type="text"
                  value={config.intro_title ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, intro_title: e.target.value || null })
                  }
                  onBlur={() => saveConfig({ intro_title: config.intro_title })}
                  placeholder="Title (e.g. Welcome to the Quiz)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
                />
                <textarea
                  value={config.intro_message ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, intro_message: e.target.value || null })
                  }
                  onBlur={() => saveConfig({ intro_message: config.intro_message })}
                  rows={2}
                  placeholder="Message shown before the quiz starts..."
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
                />
              </div>

              {/* End slide */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  End Slide
                </p>
                <input
                  type="text"
                  value={config.end_title ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, end_title: e.target.value || null })
                  }
                  onBlur={() => saveConfig({ end_title: config.end_title })}
                  placeholder="Title (e.g. Quiz Complete!)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
                />
                <textarea
                  value={config.end_message ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, end_message: e.target.value || null })
                  }
                  onBlur={() => saveConfig({ end_message: config.end_message })}
                  rows={2}
                  placeholder="Message shown after the quiz ends..."
                  className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Pass mark (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.pass_mark}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 0;
                    setConfig({ ...config, pass_mark: v });
                  }}
                  onBlur={() => saveConfig({ pass_mark: config.pass_mark })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Time limit (seconds)
                </label>
                <input
                  type="number"
                  min={0}
                  value={config.time_limit_seconds ?? ""}
                  placeholder="No limit"
                  onChange={(e) => {
                    const v = e.target.value
                      ? parseInt(e.target.value)
                      : null;
                    setConfig({ ...config, time_limit_seconds: v });
                  }}
                  onBlur={() =>
                    saveConfig({
                      time_limit_seconds: config.time_limit_seconds,
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Leave empty for no timer
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-500">
                  Max attempts
                </label>
                <input
                  type="number"
                  min={0}
                  value={config.max_attempts ?? ""}
                  placeholder="Unlimited"
                  onChange={(e) => {
                    const v = e.target.value
                      ? parseInt(e.target.value)
                      : null;
                    setConfig({ ...config, max_attempts: v });
                  }}
                  onBlur={() =>
                    saveConfig({ max_attempts: config.max_attempts })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Leave empty for unlimited retakes
                </p>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Randomize questions
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const v = !config.randomize;
                    setConfig({ ...config, randomize: v });
                    saveConfig({ randomize: v });
                  }}
                  className={`relative h-6 w-11 rounded-full transition ${
                    config.randomize ? "bg-pd-red" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                      config.randomize ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-3 text-xs text-slate-500">
                <p className="font-medium text-slate-700 mb-1">Summary</p>
                <p>{questions.length} questions</p>
                <p>
                  Total points:{" "}
                  {questions.reduce((sum, q) => sum + (q.points || 1), 0)}
                </p>
                <p>Pass: {config.pass_mark}%</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save confirmation toast */}
      {savedNotice && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg">
          <Check size={16} />
          Question saved
        </div>
      )}
    </div>
  );
}

// Individual question editor form
function QuestionForm({
  question,
  onSave,
  onDelete,
  saving,
}: {
  question: Question;
  onSave: (q: Question) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [q, setQ] = useState<Question>(question);
  // Which option's image uploader is currently open (null = none).
  const [imageOptionIdx, setImageOptionIdx] = useState<number | null>(null);

  // Sync if the parent provides a new question (after save returns updated data)
  useEffect(() => {
    setQ(question);
    setImageOptionIdx(null);
  }, [question]);

  function updateOption(idx: number, updates: Partial<Option>) {
    const opts = [...q.quiz_options];
    opts[idx] = { ...opts[idx], ...updates };

    // For single_choice, uncheck others when one is marked correct
    if (updates.is_correct && q.question_type === "single_choice") {
      opts.forEach((o, i) => {
        if (i !== idx) o.is_correct = false;
      });
    }

    setQ({ ...q, quiz_options: opts });
  }

  function addOption() {
    setQ({
      ...q,
      quiz_options: [
        ...q.quiz_options,
        {
          content: "",
          // For short answers every listed option is an accepted answer.
          is_correct: q.question_type === "short_answer",
          position: q.quiz_options.length,
        },
      ],
    });
  }

  function changeType(type: string) {
    if (type === q.question_type) return;
    let opts = q.quiz_options;
    if (type === "short_answer") {
      // Options become the accepted answers (all correct, no images).
      opts = opts.map((o) => ({ ...o, is_correct: true, image_url: null }));
    } else if (q.question_type === "short_answer") {
      opts = opts.map((o) => ({ ...o, is_correct: false }));
    } else if (type === "single_choice") {
      let seen = false;
      opts = opts.map((o) => {
        if (o.is_correct && !seen) {
          seen = true;
          return o;
        }
        return { ...o, is_correct: false };
      });
    }
    setQ({ ...q, question_type: type, quiz_options: opts });
  }

  // Short answers: drop blank accepted answers when saving.
  function save() {
    if (q.question_type === "short_answer") {
      const answers = q.quiz_options.filter((o) => o.content.trim());
      onSave({ ...q, quiz_options: answers });
    } else {
      onSave(q);
    }
  }

  function removeOption(idx: number) {
    setQ({
      ...q,
      quiz_options: q.quiz_options.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Question type selector */}
        <div className="flex items-center gap-3">
          <select
            value={q.question_type}
            onChange={(e) => changeType(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-pd-red"
          >
            <option value="single_choice">Single Choice</option>
            <option value="multiple_choice">Multiple Choice</option>
            <option value="short_answer">Short Answer</option>
          </select>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-slate-500">Points:</label>
            <input
              type="number"
              min={1}
              value={q.points}
              onChange={(e) =>
                setQ({ ...q, points: parseInt(e.target.value) || 1 })
              }
              className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-pd-red"
            />
          </div>
        </div>

        {/* Media upload (image/video) */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">
            Media (optional)
          </label>

          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setQ({ ...q, media_type: "image" })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                (q.media_type ?? "image") === "image"
                  ? "bg-pd-red/10 text-pd-red"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Image
            </button>
            <button
              type="button"
              onClick={() => setQ({ ...q, media_type: "video" })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                q.media_type === "video"
                  ? "bg-pd-red/10 text-pd-red"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Video
            </button>
          </div>

          {(q.media_type ?? "image") === "image" ? (
            <ImageUpload
              value={q.media_url ?? ""}
              onChange={(url) => setQ({ ...q, media_url: url || null, media_type: "image" })}
              lessonId={q.lesson_id}
            />
          ) : (
            <VideoUpload
              value={q.media_url ?? ""}
              onChange={(url) => setQ({ ...q, media_url: url || null, media_type: "video" })}
            />
          )}
        </div>

        {/* Question text */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">
            Question
          </label>
          <textarea
            value={q.question_text}
            onChange={(e) => setQ({ ...q, question_text: e.target.value })}
            rows={3}
            placeholder="Type your question here..."
            className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
          />
        </div>

        {/* Answer options (for choice types) */}
        {q.question_type !== "short_answer" && (
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-500">
              Answers{" "}
              <span className="text-slate-400">
                (
                {q.question_type === "single_choice"
                  ? "tick the correct answer"
                  : "tick all correct answers"}
                )
              </span>
            </label>

            <div className="space-y-3">
              {q.quiz_options.map((opt, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateOption(idx, { is_correct: !opt.is_correct })
                      }
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
                        opt.is_correct
                          ? "border-green-600 bg-green-600 text-white"
                          : "border-slate-300 hover:border-slate-400"
                      }`}
                    >
                      {opt.is_correct && <Check size={14} />}
                    </button>

                    <input
                      type="text"
                      value={opt.content}
                      onChange={(e) =>
                        updateOption(idx, { content: e.target.value })
                      }
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-pd-red"
                    />

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

                    {q.quiz_options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(idx)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Image thumbnail (when set and not editing) */}
                  {opt.image_url && imageOptionIdx !== idx && (
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

                  {/* Inline image uploader (when this option is being edited) */}
                  {imageOptionIdx === idx && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                      <ImageUpload
                        value={opt.image_url ?? ""}
                        onChange={(url) =>
                          updateOption(idx, { image_url: url || null })
                        }
                        lessonId={q.lesson_id}
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
              Add option
            </button>
          </div>
        )}

        {q.question_type === "short_answer" && (
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-500">
              Accepted answers{" "}
              <span className="text-slate-400">
                (learners type their answer; not case sensitive, any one of
                these is correct)
              </span>
            </label>

            <div className="space-y-2">
              {q.quiz_options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.content}
                    onChange={(e) =>
                      updateOption(idx, {
                        content: e.target.value,
                        is_correct: true,
                      })
                    }
                    placeholder={`Accepted answer ${idx + 1}`}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-pd-red"
                  />
                  {q.quiz_options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
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
              Add accepted answer
            </button>
          </div>
        )}

        {/* Explanation / feedback shown to learner after answering */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">
            Feedback message{" "}
            <span className="text-slate-400">(shown after user answers)</span>
          </label>
          <textarea
            value={q.explanation ?? ""}
            onChange={(e) => setQ({ ...q, explanation: e.target.value || null })}
            rows={3}
            placeholder="e.g. Enter message for feedback on the correct answer..."
            className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-pd-red"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Custom message displayed to the learner after they submit their
            answer to this question.
          </p>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700"
        >
          <Trash2 size={15} />
          Delete question
        </button>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? "Saving..." : "Save question"}
        </button>
      </div>
    </div>
  );
}
