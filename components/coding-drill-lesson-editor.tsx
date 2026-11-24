"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CodingDrillEditor } from "@/components/coding-drill-editor";
import { useAutosave } from "@/lib/use-autosave";
import { markCourseEdited, UNPUBLISHED_NOTICE } from "@/lib/mark-course-edited";
import { AutosaveStatus } from "@/components/autosave-status";

type Props = {
  lessonId: string;
  courseId: string;
  initialTitle: string;
  /** lessons.content — the serialized DrillConfig JSON (or null) */
  initialContent: string | null;
};

export function CodingDrillLessonEditor({
  lessonId,
  courseId,
  initialTitle,
  initialContent,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<string>(initialContent ?? "");
  const [message, setMessage] = useState("");
  const [courseUnpublished, setCourseUnpublished] = useState(false);

  async function persist(snapshot: { title: string; content: string }) {
    const supabase = createClient();
    // Auto mode never writes a blank title
    const update: { title?: string; content: string } = {
      content: snapshot.content,
    };
    if (snapshot.title.trim()) update.title = snapshot.title.trim();
    const { error } = await supabase
      .from("lessons")
      .update(update)
      .eq("id", lessonId);
    if (error) throw new Error(error.message);

    // Unpublish course on edit, matching other editors.
    const unpublished = await markCourseEdited({ lesson_id: lessonId });
    if (unpublished) {
      setCourseUnpublished(true);
      router.refresh();
    }
  }

  const autosave = useAutosave({
    data: { title, content },
    save: persist,
    canSave: (d) => (d.title.trim() ? null : "Please enter a lesson title."),
  });
  const saving = autosave.status === "saving";

  async function handleSave() {
    if (!title.trim()) {
      setMessage("Please enter a lesson title.");
      return;
    }
    setMessage("");
    const ok = await autosave.flush();
    if (ok) router.refresh();
  }
  return (
    <div className="space-y-6" onBlur={() => void autosave.flush()}>
      {/* Lesson title */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Lesson title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-medium outline-none focus:border-slate-900"
        />
      </div>

      {/* Drill config */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <CodingDrillEditor value={content} onChange={setContent} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4">
        {message && (
          <span className="text-sm text-slate-500">{message}</span>
        )}
        <AutosaveStatus
          status={autosave.status}
          errorMessage={autosave.errorMessage}
          onRetry={() => void autosave.flush()}
          notice={courseUnpublished ? UNPUBLISHED_NOTICE : undefined}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Save size={18} />
          )}
          {saving ? "Saving..." : "Save Drill"}
        </button>
      </div>
    </div>
  );
}
