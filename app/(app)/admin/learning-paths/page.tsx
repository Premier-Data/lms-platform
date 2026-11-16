"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  UserPlus,
  GripVertical,
  Search,
  Check,
  Route,
} from "lucide-react";

type Course = { id: string; title: string; status: string };
type PathCourse = {
  id: string;
  path_id: string;
  course_id: string;
  position: number;
  courses: Course | Course[] | null;
};
type Path = {
  id: string;
  title: string;
  description: string | null;
  courses: PathCourse[];
  assignment_count: number;
  created_at: string;
};
type User = { id: string; email: string; full_name: string };

export default function LearningPathsPage() {
  const supabase = createClient();

  const [paths, setPaths] = useState<Path[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [showEditor, setShowEditor] = useState(false);
  const [editPath, setEditPath] = useState<Path | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCourseIds, setEditCourseIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Assign modal
  const [assignPath, setAssignPath] = useState<Path | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState("");
  // Users already on the path (shown highlighted, can't be re-selected)
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  // "x users assigned" list
  const [viewPath, setViewPath] = useState<Path | null>(null);
  const [viewList, setViewList] = useState<
    { user_id: string; assigned_at: string | null }[]
  >([]);
  const [viewSearch, setViewSearch] = useState("");
  const [loadingView, setLoadingView] = useState(false);

  // Delete
  const [deletePath, setDeletePath] = useState<Path | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    const [pathsRes, coursesRes, usersRes] = await Promise.all([
      fetch("/api/admin/learning-paths"),
      supabase
        .from("courses")
        .select("id, title, status")
        .order("title", { ascending: true }),
      fetch("/api/admin/users"),
    ]);

    if (pathsRes.ok) {
      const d = await pathsRes.json();
      setPaths(d.paths ?? []);
    }

    setAllCourses(coursesRes.data ?? []);

    if (usersRes.ok) {
      const d = await usersRes.json();
      setUsers(d.users ?? []);
    }

    setLoading(false);
  }

  function openCreate() {
    setEditPath(null);
    setEditTitle("");
    setEditDescription("");
    setEditCourseIds([]);
    setShowEditor(true);
  }

  function openEdit(path: Path) {
    setEditPath(path);
    setEditTitle(path.title);
    setEditDescription(path.description ?? "");
    setEditCourseIds(
      path.courses.map((pc) => pc.course_id)
    );
    setShowEditor(true);
  }

  async function handleSave() {
    if (!editTitle.trim()) return;
    setSaving(true);

    const body = {
      id: editPath?.id,
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      course_ids: editCourseIds,
    };

    const res = await fetch("/api/admin/learning-paths", {
      method: editPath ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (res.ok) {
      setShowEditor(false);
      loadData();
    }
  }

  async function handleDelete() {
    if (!deletePath) return;
    setDeleting(true);
    await fetch(`/api/admin/learning-paths?id=${deletePath.id}`, {
      method: "DELETE",
    });
    setDeleting(false);
    setDeletePath(null);
    loadData();
  }

  async function fetchAssigned(pathId: string) {
    const res = await fetch(
      `/api/admin/learning-paths/assign?path_id=${pathId}`
    );
    if (!res.ok) return [];
    const d = await res.json();
    return (d.assignments ?? []) as {
      user_id: string;
      assigned_at: string | null;
    }[];
  }

  async function openAssign(path: Path) {
    setAssignPath(path);
    setSelectedUsers(new Set());
    setUserSearch("");
    setAssignMessage("");
    setAssignedIds(new Set());
    setLoadingAssigned(true);
    const list = await fetchAssigned(path.id);
    setAssignedIds(new Set(list.map((a) => a.user_id)));
    setLoadingAssigned(false);
  }

  async function openAssignedList(path: Path) {
    setViewPath(path);
    setViewSearch("");
    setViewList([]);
    setLoadingView(true);
    setViewList(await fetchAssigned(path.id));
    setLoadingView(false);
  }

  async function handleAssign() {
    if (!assignPath || selectedUsers.size === 0) return;
    setAssigning(true);
    setAssignMessage("");

    const res = await fetch("/api/admin/learning-paths/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path_id: assignPath.id,
        user_ids: Array.from(selectedUsers),
      }),
    });

    const data = await res.json();
    setAssigning(false);

    if (res.ok) {
      setAssignMessage(
        `${data.assigned_paths} assigned, ${data.assigned_courses} courses allocated.`
      );
      loadData();
      setTimeout(() => {
        setAssignPath(null);
        setAssignMessage("");
      }, 1500);
    }
  }

  function toggleCourse(courseId: string) {
    setEditCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId]
    );
  }

  function moveCourse(idx: number, direction: "up" | "down") {
    const arr = [...editCourseIds];
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setEditCourseIds(arr);
  }

  const filteredUsers = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Learning Paths
          </h1>
          <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
          <p className="mt-4 text-slate-500">
            Create ordered course sequences for structured learning.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover"
        >
          <Plus size={18} />
          Create Path
        </button>
      </div>

      {/* Paths list */}
      {paths.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pd-red/10">
            <Route size={28} className="text-pd-red" />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">
            No learning paths yet
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Create your first learning path to structure course sequences.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paths.map((path) => {
            const courseNames = path.courses.map((pc) => {
              const c = Array.isArray(pc.courses)
                ? pc.courses[0]
                : pc.courses;
              return c?.title ?? "Unknown";
            });

            return (
              <div
                key={path.id}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {path.title}
                    </h3>
                    {path.description && (
                      <p className="mt-1 text-sm text-slate-500">
                        {path.description}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {courseNames.map((name, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-pd-red text-[10px] font-bold text-white">
                            {i + 1}
                          </span>
                          {name}
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => openAssignedList(path)}
                      disabled={path.assignment_count === 0}
                      className="mt-3 text-xs font-medium text-slate-500 underline-offset-2 transition hover:text-pd-red hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline"
                    >
                      {path.assignment_count} user
                      {path.assignment_count !== 1 ? "s" : ""} assigned
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openAssign(path)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-pd-red transition hover:bg-pd-red/5"
                    >
                      <UserPlus size={16} />
                      Assign
                    </button>
                    <button
                      onClick={() => openEdit(path)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setDeletePath(path)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900">
                {editPath ? "Edit Learning Path" : "Create Learning Path"}
              </h2>
              <button
                onClick={() => setShowEditor(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Path title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="e.g. New Employee Onboarding"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Description (optional)
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-pd-red"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Courses (in order)
                </label>

                {/* Selected courses with reorder */}
                {editCourseIds.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {editCourseIds.map((cid, idx) => {
                      const course = allCourses.find((c) => c.id === cid);
                      return (
                        <div
                          key={cid}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pd-red text-[11px] font-bold text-white">
                            {idx + 1}
                          </span>
                          <span className="flex-1 text-sm font-medium text-slate-900">
                            {course?.title ?? "Unknown"}
                          </span>
                          <button
                            type="button"
                            onClick={() => moveCourse(idx, "up")}
                            disabled={idx === 0}
                            className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveCourse(idx, "down")}
                            disabled={idx === editCourseIds.length - 1}
                            className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                          >
                            ▼
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCourse(cid)}
                            className="rounded p-1 text-slate-400 hover:text-red-500"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Available courses to add */}
                <div className="space-y-1.5">
                  {allCourses
                    .filter((c) => !editCourseIds.includes(c.id))
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCourse(c.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-50"
                      >
                        <Plus size={15} className="text-slate-400" />
                        {c.title}
                        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          {c.status}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 p-6">
              <button
                onClick={() => setShowEditor(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editTitle.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white hover:bg-pd-red-hover disabled:opacity-50"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {editPath ? "Save Changes" : "Create Path"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Assign Learning Path
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {assignPath.title}
                </p>
              </div>
              <button
                onClick={() => setAssignPath(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-pd-red"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loadingAssigned && (
                <p className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
                  <Loader2 size={13} className="animate-spin" />
                  Checking who is already assigned…
                </p>
              )}
              {[...filteredUsers]
                .sort(
                  (a, b) =>
                    Number(assignedIds.has(b.id)) - Number(assignedIds.has(a.id))
                )
                .map((u) => {
                const already = assignedIds.has(u.id);
                const selected = already || selectedUsers.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={already}
                    title={already ? "Already assigned to this path" : undefined}
                    onClick={() => {
                      setSelectedUsers((prev) => {
                        const next = new Set(prev);
                        if (next.has(u.id)) next.delete(u.id);
                        else next.add(u.id);
                        return next;
                      });
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition disabled:cursor-default ${
                      already
                        ? "bg-emerald-50"
                        : selected
                          ? "bg-pd-red/5"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {u.full_name || u.email}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {u.email}
                      </p>
                    </div>
                    {already && (
                      <span className="ml-2 mr-2 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Assigned
                      </span>
                    )}
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                        already
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : selected
                            ? "border-pd-red bg-pd-red text-white"
                            : "border-slate-300"
                      }`}
                    >
                      {selected && <Check size={14} />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-slate-200 p-6">
              {assignMessage && (
                <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {assignMessage}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {selectedUsers.size} new selected
                  {assignedIds.size > 0 && (
                    <span className="text-slate-400">
                      {" "}· {assignedIds.size} already assigned
                    </span>
                  )}
                </span>
                <button
                  onClick={handleAssign}
                  disabled={assigning || selectedUsers.size === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-pd-red-hover disabled:opacity-50"
                >
                  {assigning && <Loader2 size={16} className="animate-spin" />}
                  {assigning ? "Assigning..." : "Assign Path"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assigned users list */}
      {viewPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Assigned users
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {viewPath.title} · {viewList.length} user
                  {viewList.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setViewPath(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={viewSearch}
                  onChange={(e) => setViewSearch(e.target.value)}
                  placeholder="Search assigned users..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-pd-red"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {loadingView ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin text-slate-400" size={22} />
                </div>
              ) : (
                (() => {
                  const byId = new Map(users.map((u) => [u.id, u]));
                  const rows = viewList
                    .map((a) => ({ ...a, user: byId.get(a.user_id) }))
                    .filter((r) => {
                      const s = viewSearch.toLowerCase();
                      if (!s) return true;
                      return (
                        (r.user?.full_name ?? "").toLowerCase().includes(s) ||
                        (r.user?.email ?? "").toLowerCase().includes(s)
                      );
                    })
                    .sort((a, b) =>
                      (a.user?.full_name || a.user?.email || "~").localeCompare(
                        b.user?.full_name || b.user?.email || "~"
                      )
                    );
                  if (rows.length === 0) {
                    return (
                      <p className="py-10 text-center text-sm text-slate-400">
                        No users found.
                      </p>
                    );
                  }
                  return rows.map((r) => (
                    <div
                      key={r.user_id}
                      className="flex items-center justify-between rounded-xl px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {r.user?.full_name || r.user?.email || "Unknown user"}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {r.user?.email ?? r.user_id}
                        </p>
                      </div>
                      {r.assigned_at && (
                        <span className="ml-3 shrink-0 text-xs text-slate-400">
                          {new Date(r.assigned_at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  ));
                })()
              )}
            </div>

            <div className="flex justify-end border-t border-slate-200 p-4">
              <button
                onClick={() => {
                  const p = viewPath;
                  setViewPath(null);
                  openAssign(p);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white hover:bg-pd-red-hover"
              >
                <UserPlus size={16} />
                Assign more
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deletePath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              Delete learning path?
            </h2>
            <p className="mt-3 text-sm text-slate-500">
              This will delete{" "}
              <span className="font-medium text-slate-700">
                {deletePath.title}
              </span>
              . Existing course assignments will remain but won&apos;t be
              sequenced.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeletePath(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
