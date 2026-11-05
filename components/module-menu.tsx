"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ModuleMenuProps = {
  moduleId: string;
  courseId: string;
  title: string;
  description: string | null;
  /** called after edit/delete so the parent can refresh its list */
  onChanged?: () => void;
};

export function ModuleMenu({
  moduleId,
  courseId,
  title,
  description,
  onChanged,
}: ModuleMenuProps) {
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

  const [editing, setEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [newDescription, setNewDescription] = useState(description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);

  function openMenu() {
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
    fetch("/api/admin/unpublish-on-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId }),
    });
  }

  async function handleSave() {
    if (!newTitle.trim()) return;
    setWorking(true);
    await supabase
      .from("modules")
      .update({
        title: newTitle.trim(),
        description: newDescription.trim() || null,
      })
      .eq("id", moduleId);
    setWorking(false);
    setEditing(false);
    unpublishOnEdit();
    onChanged?.();
    router.refresh();
  }

  async function handleDelete() {
    setWorking(true);
    // Course → modules → lessons cascade is set up in the DB, so deleting the
    // module removes its lessons (and their blocks/pages/quizzes) too.
    await supabase.from("modules").delete().eq("id", moduleId);
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
        onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        title="Module options"
      >
        {working ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <MoreHorizontal size={18} />
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
            className="fixed z-[60] w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setNewTitle(title);
                setNewDescription(description ?? "");
                setEditing(true);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <Pencil size={15} />
              Edit / rename
            </button>
            <button
              type="button"
              onClick={() => {
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

      {/* Edit modal */}
      {mounted &&
        editing &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Edit module
                </h2>
              <button
                onClick={() => setEditing(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <label className="mb-2 block text-sm font-medium text-slate-700">
              Module title
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-pd-red"
              autoFocus
            />

            <label className="mb-2 mt-4 block text-sm font-medium text-slate-700">
              Description{" "}
              <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none focus:border-pd-red"
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEditing(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={working || !newTitle.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-pd-red-hover disabled:opacity-50"
              >
                {working && <Loader2 size={16} className="animate-spin" />}
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
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">
                Delete module?
              </h2>
              <p className="mt-3 text-sm text-slate-500">
                This permanently deletes{" "}
                <span className="font-medium text-slate-700">{title}</span> and
                all lessons and quizzes inside it. This cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
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
