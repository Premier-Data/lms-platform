"use client";

import { useMemo, useState } from "react";

export type UserProgressRow = {
  id: string;
  name: string;
  email: string;
  assigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  avgQuizScore: number | null;
  totalAttempts: number;
  drillAttempts: number;
  bestDrillAccuracy: number | null;
};

type SortKey =
  | "name"
  | "assigned"
  | "completed"
  | "inProgress"
  | "notStarted"
  | "avgQuizScore"
  | "totalAttempts"
  | "drillAttempts"
  | "bestDrillAccuracy";

export function UserProgressTable({ rows }: { rows: UserProgressRow[] }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const view = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return rows
      .filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.email.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name) * dir;
        const av = (a[sortBy] as number | null) ?? -1;
        const bv = (b[sortBy] as number | null) ?? -1;
        return (av - bv) * dir;
      });
  }, [rows, search, sortBy, sortDir]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="max-w-xs flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pd-red"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-pd-red"
          title="Sort by"
        >
          <option value="name">Sort: Name</option>
          <option value="assigned">Sort: Assigned</option>
          <option value="completed">Sort: Completed</option>
          <option value="inProgress">Sort: In Progress</option>
          <option value="notStarted">Sort: Not Started</option>
          <option value="avgQuizScore">Sort: Avg Quiz %</option>
          <option value="totalAttempts">Sort: Quiz Attempts</option>
          <option value="drillAttempts">Sort: Drill Attempts</option>
          <option value="bestDrillAccuracy">Sort: Best Drill %</option>
        </select>
        <button
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          title={sortDir === "asc" ? "Ascending" : "Descending"}
        >
          {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-5 py-3 font-semibold text-slate-700">User</th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  Assigned
                </th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  Completed
                </th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  In Progress
                </th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  Not Started
                </th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  Avg Quiz %
                </th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  Quiz Attempts
                </th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  Drill Attempts
                </th>
                <th className="px-5 py-3 font-semibold text-slate-700">
                  Best Drill %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {view.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    <div>
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{u.assigned}</td>
                  <td className="px-5 py-3 text-green-700">{u.completed}</td>
                  <td className="px-5 py-3 text-amber-700">{u.inProgress}</td>
                  <td className="px-5 py-3 text-slate-500">{u.notStarted}</td>
                  <td className="px-5 py-3 text-slate-700">
                    {u.avgQuizScore !== null ? `${u.avgQuizScore}%` : "—"}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {u.totalAttempts}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {u.drillAttempts}
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {u.bestDrillAccuracy !== null
                      ? `${u.bestDrillAccuracy}%`
                      : "—"}
                  </td>
                </tr>
              ))}
              {view.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-8 text-center text-slate-400"
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-right text-xs text-slate-400">
        Showing {view.length} of {rows.length} user
        {rows.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
