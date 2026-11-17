"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NotifyModal } from "@/components/notify-modal";
import {
  Loader2,
  BookOpen,
  UserPlus,
  X,
  Search,
  Check,
  Bell,
} from "lucide-react";

type Course = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  thumbnail_url: string | null;
  course_category_links?: {
    course_categories: { name: string } | { name: string }[] | null;
  }[];
};

type User = {
  id: string;
  email: string;
  full_name: string;
  status: string;
};

export default function AllocationsPage() {
  const supabase = createClient();

  const [courses, setCourses] = useState<Course[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Allocation modal
  const [allocateCourse, setAllocateCourse] = useState<Course | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [allocateMessage, setAllocateMessage] = useState("");

  // Notify modal (shared component)
  const [notifyCourse, setNotifyCourse] = useState<Course | null>(null);
  const openNotify = (course: Course) => setNotifyCourse(course);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError("");

      // Try including the category join; fall back to a plain query if the
      // category schema isn't set up yet.
      let courseData: Course[] | null = null;

      const withCategory = await supabase
        .from("courses")
        .select(
          "id, title, description, status, thumbnail_url, course_category_links ( course_categories ( name ) )"
        )
        .order("created_at", { ascending: false });

      if (withCategory.error) {
        const plain = await supabase
          .from("courses")
          .select("id, title, description, status, thumbnail_url")
          .order("created_at", { ascending: false });

        if (plain.error) {
          setError(plain.error.message);
          setLoading(false);
          return;
        }
        courseData = plain.data as Course[];
      } else {
        courseData = withCategory.data as unknown as Course[];
      }

      setCourses(courseData ?? []);

      // Fetch users for allocation (admin endpoint)
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }

      setLoading(false);
    }

    loadData();
  }, [supabase]);

  function openAllocate(course: Course) {
    setAllocateCourse(course);
    setSelectedUsers(new Set());
    setUserSearch("");
    setDueDate("");
    setAllocateMessage("");

    // Fetch existing allocations for this course to pre-tick assigned users
    fetch(`/api/admin/allocate?course_id=${course.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user_ids) {
          setSelectedUsers(new Set(data.user_ids));
        }
      })
      .catch(() => {});
  }

  function toggleUser(id: string) {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleAllocate() {
    if (!allocateCourse || selectedUsers.size === 0) return;

    setAllocating(true);
    setAllocateMessage("");

    const res = await fetch("/api/admin/allocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_id: allocateCourse.id,
        user_ids: Array.from(selectedUsers),
        due_date: dueDate || null,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setAllocateMessage(data.error || "Failed to allocate course.");
      setAllocating(false);
      return;
    }

    const parts = [];
    if (data.assigned > 0) parts.push(`${data.assigned} assigned`);
    if (data.skipped > 0) parts.push(`${data.skipped} already assigned`);
    if (data.emailed > 0) parts.push(`${data.emailed} emailed`);
    if (data.email_error) parts.push(`email not sent: ${data.email_error}`);
    setAllocateMessage(parts.join(", ") + ".");
    setAllocating(false);
    setSelectedUsers(new Set());

    // Close the modal shortly after a successful allocation.
    setTimeout(() => {
      setAllocateCourse(null);
      setAllocateMessage("");
    }, data.email_error ? 6000 : 1500);
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Courses
        </h1>

        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />

        <p className="mt-4 text-slate-500">
          View all courses and allocate them to users.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <BookOpen size={28} className="text-slate-400" />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">No courses yet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create courses in the Course Builder first.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-6 py-3.5 font-semibold text-slate-700">
                  Course
                </th>
                <th className="px-6 py-3.5 font-semibold text-slate-700">
                  Status
                </th>
                <th className="px-6 py-3.5 text-right font-semibold text-slate-700">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {courses.map((course) => (
                <tr key={course.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-pd-navy to-pd-navy-surface">
                        {course.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={course.thumbnail_url}
                            alt={course.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <BookOpen size={18} className="text-white/70" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">
                            {course.title}
                          </p>
                          {course.course_category_links
                            ?.map((link) => {
                              const cc = link.course_categories;
                              return Array.isArray(cc)
                                ? cc[0]?.name
                                : cc?.name;
                            })
                            .filter(Boolean)
                            .map((name) => (
                              <span
                                key={name}
                                className="inline-flex rounded-full bg-pd-red/10 px-2 py-0.5 text-[11px] font-medium text-pd-red"
                              >
                                {name}
                              </span>
                            ))}
                        </div>
                        {course.description && (
                          <p className="line-clamp-1 max-w-md text-xs text-slate-500">
                            {course.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        course.status === "published"
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {course.status === "published" ? "Published" : "Draft"}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openNotify(course)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Bell size={15} />
                        Notify
                      </button>
                      <button
                        onClick={() => openAllocate(course)}
                        className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-pd-red-hover"
                      >
                        <UserPlus size={15} />
                        Allocate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Allocate modal */}
      {allocateCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Allocate course
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {allocateCourse.title}
                </p>
              </div>
              <button
                onClick={() => setAllocateCourse(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="border-b border-slate-200 p-6">
              <label className="block text-sm font-medium text-slate-700">
                Due date <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pd-red"
              />

              <div className="relative mt-4">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-pd-red"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {filteredUsers.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">
                  No users found.
                </p>
              ) : (
                filteredUsers.map((u) => {
                  const selected = selectedUsers.has(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${
                        selected ? "bg-pd-red/5" : "hover:bg-slate-50"
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

                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                          selected
                            ? "border-pd-red bg-pd-red text-white"
                            : "border-slate-300"
                        }`}
                      >
                        {selected && <Check size={14} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-200 p-6">
              {allocateMessage && (
                <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {allocateMessage}
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {selectedUsers.size} selected
                </span>

                <div className="flex gap-3">
                  <button
                    onClick={() => setAllocateCourse(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleAllocate}
                    disabled={allocating || selectedUsers.size === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allocating && (
                      <Loader2 size={16} className="animate-spin" />
                    )}
                    {allocating ? "Allocating..." : "Allocate"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notify modal */}
      {notifyCourse && (
        <NotifyModal
          kind="course"
          id={notifyCourse.id}
          title={notifyCourse.title}
          users={users}
          onClose={() => setNotifyCourse(null)}
        />
      )}
    </div>
  );
}
