"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Pencil, X, Check } from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { useAutosave } from "@/lib/use-autosave";
import { markCourseEdited, UNPUBLISHED_NOTICE } from "@/lib/mark-course-edited";
import { AutosaveStatus } from "@/components/autosave-status";

type Category = { id: string; name: string };

type EditCourseDetailsProps = {
  courseId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
};

export function EditCourseDetails({
  courseId,
  title,
  description,
  thumbnailUrl,
}: EditCourseDetailsProps) {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editDescription, setEditDescription] = useState(description ?? "");
  const [editThumbnail, setEditThumbnail] = useState(thumbnailUrl ?? "");
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [categoriesAvailable, setCategoriesAvailable] = useState(false);
  const [categoriesDone, setCategoriesDone] = useState(false);
  const [linksFetched, setLinksFetched] = useState(false);
  const [courseUnpublished, setCourseUnpublished] = useState(false);
  const savedSomething = useRef(false);

  // Reset the form only when the modal is opened, never on a prop refresh.
  function openModal() {
    setEditTitle(title);
    setEditDescription(description ?? "");
    setEditThumbnail(thumbnailUrl ?? "");
    setCategoriesAvailable(false);
    setCategoriesDone(false);
    setLinksFetched(false);
    setCourseUnpublished(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Load all categories
    const all = fetch("/api/admin/categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.categories) {
          setCategories(data.categories);
          setCategoriesAvailable(true);
        }
      })
      .catch(() => {});
    // Load this course's current category links
    const links = fetch(`/api/admin/course-categories?course_id=${courseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.category_ids) {
          setSelectedCategories(new Set<string>(data.category_ids));
          setLinksFetched(true);
        }
      })
      .catch(() => {});
    Promise.all([all, links]).then(() => {
      if (!cancelled) setCategoriesDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, courseId]);

  const autosave = useAutosave({
    data: {
      editTitle,
      editDescription,
      editThumbnail,
      selectedCategories: Array.from(selectedCategories).sort(),
    },
    // Wait until categories are known so existing links are never wiped.
    enabled: open && categoriesDone,
    canSave: (d) => (d.editTitle.trim() ? null : "Please enter a course title."),
    save: async (d) => {
      const { error: updErr } = await supabase
        .from("courses")
        .update({
          title: d.editTitle.trim(),
          description: d.editDescription.trim() || null,
          thumbnail_url: d.editThumbnail.trim() || null,
        })
        .eq("id", courseId);
      if (updErr) throw new Error(updErr.message);

      // Replace category links (only when both lists were loaded)
      if (categoriesAvailable && linksFetched) {
        const res = await fetch("/api/admin/course-categories", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            course_id: courseId,
            category_ids: d.selectedCategories,
          }),
        });
        if (!res.ok) throw new Error("Could not save categories.");
      }
      savedSomething.current = true;
      if (await markCourseEdited({ course_id: courseId })) {
        setCourseUnpublished(true);
      }
    },
  });

  async function closeModal() {
    if (editTitle.trim()) {
      const ok = await autosave.flush();
      if (!ok) return; // keep the modal open so the failed edit stays visible
    }
    setOpen(false);
    if (savedSomething.current) {
      savedSomething.current = false;
      router.refresh();
    }
  }
  function toggleCategory(id: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <Pencil size={18} />
        Edit details
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onBlur={() => void autosave.flush()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Edit course details
              </h2>
              <button
                onClick={closeModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Course title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Course thumbnail
                </label>
                <div className="mt-2">
                  <ImageUpload
                    value={editThumbnail}
                    onChange={(url) => setEditThumbnail(url)}
                  />
                </div>
              </div>

              {categoriesAvailable && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Categories
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const selected = selectedCategories.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCategory(c.id)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                            selected
                              ? "border-pd-red bg-pd-red/10 text-pd-red"
                              : "border-slate-300 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {selected && <Check size={14} />}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                />
              </div>

            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 p-6">
              <AutosaveStatus
                status={autosave.status}
                errorMessage={autosave.errorMessage}
                onRetry={() => void autosave.flush()}
                notice={courseUnpublished ? UNPUBLISHED_NOTICE : undefined}
              />
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={closeModal}
                disabled={autosave.status === "saving"}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
              >
                {autosave.status === "saving" && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                {autosave.status === "saving" ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
