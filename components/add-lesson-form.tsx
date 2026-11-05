"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Video,
  HelpCircle,
  ClipboardCheck,
  Film,
  Plus,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LessonType =
  | "lesson"
  | "video"
  | "quiz"
  | "assessment"
  | "coding_drill";

type AddLessonFormProps = {
  moduleId: string;
};

const lessonTypes = [
  {
    type: "lesson" as LessonType,
    label: "Lesson",
    description: "Text, images and learning content",
    icon: FileText,
  },
  {
    type: "video" as LessonType,
    label: "Video",
    description: "Video training content",
    icon: Video,
  },
  {
    type: "quiz" as LessonType,
    label: "Quiz",
    description: "Test learner knowledge",
    icon: HelpCircle,
  },
  {
    type: "assessment" as LessonType,
    label: "Assessment",
    description: "Formal assessment",
    icon: ClipboardCheck,
  },
  {
    type: "coding_drill" as LessonType,
    label: "Coding Drill",
    description: "Video + stats, graded against a master",
    icon: Film,
  },
];

export function AddLessonForm({
  moduleId,
}: AddLessonFormProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"type" | "details">("type");
  const [lessonType, setLessonType] =
    useState<LessonType>("lesson");

  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function openModal() {
    setIsOpen(true);
    setStep("type");
    setTitle("");
    setError("");
  }

  function closeModal() {
    setIsOpen(false);
    setStep("type");
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!title.trim()) {
      setError("Please enter a lesson title.");
      return;
    }

    setIsSaving(true);
    setError("");

    const supabase = createClient();

    const { error: insertError } = await supabase
      .from("lessons")
      .insert({
        module_id: moduleId,
        title: title.trim(),
        lesson_type: lessonType,
      });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    closeModal();
    setIsSaving(false);

    // Unpublish course on edit
    fetch("/api/admin/unpublish-on-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module_id: moduleId }),
    });

    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Plus size={17} />
        Add lesson
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Add Content
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {step === "type"
                    ? "Choose the type of training content."
                    : "Give your content a title."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {step === "type" ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {lessonTypes.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        setLessonType(item.type);
                        setStep("details");
                      }}
                      className="flex items-start gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-900 hover:bg-slate-50"
                    >
                      <div className="rounded-xl bg-slate-100 p-3 text-slate-700">
                        <Icon size={22} />
                      </div>

                      <div>
                        <h3 className="font-semibold text-slate-900">
                          {item.label}
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                          {item.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="mt-6 space-y-5"
              >
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Title
                  </label>

                  <input
                    type="text"
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    placeholder="Enter a title"
                    autoFocus
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                  />
                </div>

                {error && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div className="flex justify-between border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => setStep("type")}
                    className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isSaving ? "Creating..." : "Create Content"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}