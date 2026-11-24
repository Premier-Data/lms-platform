"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Type, Trash2, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAutosave } from "@/lib/use-autosave";
import { markCourseEdited, UNPUBLISHED_NOTICE } from "@/lib/mark-course-edited";
import { AutosaveStatus } from "@/components/autosave-status";

type LessonMenuProps = {
  lessonId: string;
  courseId: string;
  title: string;
  /** called after rename/delete so the parent can refresh */
  onChanged?: () => void;
};

export function LessonMenu({
  lessonId,
  courseId,
  title,
  onChanged,
}: LessonMenuProps) {
  const router = useRouter();
  const supabase = createClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);

  // Stop the surrounding lesson <Link> from navigating.
  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function openMenu(e: React.MouseEvent) {
    stop(e);
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const menuHeight = 96; // ~2 items
      const right = window.innerWidth - rect.right;
      // Flip up if there isn't enough room below the button.
      if (window.innerHeight - rect.bottom < menuHeight + 12) {
        setMenuPos({ bottom: window.innerHeight - rect.top + 4, right });
      } else {
        setMenuPos({ top: rect.bottom + 4, right });
      }
    }
    setMenuOpen(true);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function unpublishOnEdit() {
    void markCourseEdited({ course_id: courseId });
  }

  const [courseUnpublished, setCourseUnpublished] = useState(false);
  const savedSomething = useRef(false);

  const autosave = useAutosave({
    data: { newTitle },
    enabled: renaming,
    canSave: (d) => (d.newTitle.trim() ? null : "Title can't be empty"),
    save: async (d) => {
      const { error } = await supabase
        .from("lessons")
        .update({ title: d.newTitle.trim() })
        .eq("id", lessonId);
      if (error) throw new Error(error.message);
      savedSomething.current = true;
      if (await markCourseEdited({ course_id: courseId })) {
        setCourseUnpublished(true);
      }
    },
  });

  async function closeRenaming() {
    const ok = await autosave.flush();
    if (!ok && !window.confirm("Unsaved changes could not be saved. Close and discard them?")) return;
    setRenaming(false);
    if (savedSomething.current) {
      savedSomething.current = false;
      onChanged?.();
      router.refresh();
    }
  }
  async function handleDelete() {
    setWorking(true);
    await supabase.from("lessons").delete().eq("id", lessonId);
    setWorking(false);
    setConfirmDelete(false);
    unpublishOnEdit();
    onChanged?.();
    router.refresh();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => (menuOpen ? (stop(e), setMenuOpen(false)) : openMenu(e))}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
        title="Lesson options"
      >
        {working ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <MoreHorizontal size={16} />
        )}
      </button>

      {mounted &&
        menuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              top: menuPos.top,
              bottom: menuPos.bottom,
              right: menuPos.right,
            }}
            className="fixed z-[60] w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                setMenuOpen(false);
                setNewTitle(title);
                setCourseUnpublished(false);
                setRenaming(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <Type size={15} />
              Rename
            </button>
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
            >
              <Trash2 size={15} />
              Delete
            </button>
          </div>,
          document.body
        )}

      {/* Rename modal */}
      {mounted &&
        renaming &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
            onClick={stop}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
              onBlur={() => void autosave.flush()}
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Rename lesson
                </h2>
                <button
                  onClick={(e) => {
                    stop(e);
                    void closeRenaming();
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X size={20} />
                </button>
              </div>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-pd-red"
                autoFocus
              />
              <div className="mt-4 flex justify-end">
                <AutosaveStatus
                  status={autosave.status}
                  errorMessage={autosave.errorMessage}
                  onRetry={() => void autosave.flush()}
                  notice={courseUnpublished ? UNPUBLISHED_NOTICE : undefined}
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={(e) => {
                    stop(e);
                    void closeRenaming();
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  onClick={(e) => {
                    stop(e);
                    void closeRenaming();
                  }}
                  disabled={working || !newTitle.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-pd-red-hover disabled:opacity-50"
                >
                  {autosave.status === "saving" && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete confirmation */}
      {mounted &&
        confirmDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
            onClick={stop}
          >
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">
                Delete lesson?
              </h2>
              <p className="mt-3 text-sm text-slate-500">
                This permanently deletes{" "}
                <span className="font-medium text-slate-700">{title}</span> and
                its content. This cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={(e) => {
                    stop(e);
                    setConfirmDelete(false);
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    stop(e);
                    handleDelete();
                  }}
                  disabled={working}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {working && <Loader2 size={16} className="animate-spin" />}
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
