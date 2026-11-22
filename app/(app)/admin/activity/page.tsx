"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Loader2, Search, RefreshCw } from "lucide-react";
import { formatDuration, type PresenceStatus } from "@/lib/activity";
import { StatusBadge } from "@/components/activity-status";

type DirUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  location?: string;
  status: string;
};

type Row = {
  user_id: string;
  worked_ms: number;
  first_active: string | null;
  last_active: string | null;
  status: PresenceStatus;
  last_seen_at: string | null;
  last_active_at: string | null;
  current_course: string | null;
};

type RangeKey = "today" | "7d" | "30d" | "custom";

const toInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(key: RangeKey, from: string, to: string) {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOf(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (key === "today") return { from: today, to: tomorrow };
  if (key === "7d" || key === "30d") {
    const f = new Date(today);
    f.setDate(f.getDate() - (key === "7d" ? 6 : 29));
    return { from: f, to: tomorrow };
  }
  const f = from ? new Date(`${from}T00:00:00`) : today;
  const t = to ? new Date(`${to}T00:00:00`) : today;
  t.setDate(t.getDate() + 1);
  return { from: f, to: t };
}

const STATUS_ORDER: Record<PresenceStatus, number> = { active: 0, idle: 1, offline: 2 };

export default function ActivityPage() {
  const [users, setUsers] = useState<DirUser[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState<RangeKey>("today");
  const [from, setFrom] = useState(toInput(new Date()));
  const [to, setTo] = useState(toInput(new Date()));
  const [search, setSearch] = useState("");
  const [showAdmins, setShowAdmins] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "online">("all");

  const r = useMemo(() => rangeFor(range, from, to), [range, from, to]);

  const load = useCallback(async () => {
    setError("");
    const [uRes, aRes] = await Promise.all([
      users.length ? Promise.resolve(null) : fetch("/api/admin/users"),
      fetch(
        `/api/admin/activity?from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(
          r.to.toISOString()
        )}`
      ),
    ]);
    if (uRes?.ok) setUsers((await uRes.json()).users ?? []);
    const a = await aRes.json().catch(() => ({}));
    if (!aRes.ok) setError(a.error || "Couldn't load activity.");
    else setRows(a.users ?? []);
    setLoading(false);
  }, [r, users.length]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const table = useMemo(() => {
    const byId = new Map(rows.map((x) => [x.user_id, x]));
    const s = search.toLowerCase();
    return users
      .filter((u) => u.status !== "archived")
      .filter((u) => showAdmins || u.role === "learner")
      .filter(
        (u) =>
          !s ||
          u.full_name.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s) ||
          (u.location ?? "").toLowerCase().includes(s)
      )
      .map((u) => ({
        user: u,
        a:
          byId.get(u.id) ??
          ({
            user_id: u.id,
            worked_ms: 0,
            first_active: null,
            last_active: null,
            status: "offline",
            last_seen_at: null,
            last_active_at: null,
            current_course: null,
          } as Row),
      }))
      .filter((x) => statusFilter === "all" || x.a.status !== "offline")
      .sort(
        (x, y) =>
          STATUS_ORDER[x.a.status] - STATUS_ORDER[y.a.status] ||
          y.a.worked_ms - x.a.worked_ms ||
          (x.user.full_name || x.user.email).localeCompare(y.user.full_name || y.user.email)
      );
  }, [users, rows, search, showAdmins, statusFilter]);

  const online = table.filter((x) => x.a.status !== "offline").length;
  const activeNow = table.filter((x) => x.a.status === "active").length;
  const totalWorked = table.reduce((n, x) => n + x.a.worked_ms, 0);

  const qs = `range=${range}&from=${from}&to=${to}`;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Learner Activity</h1>
        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
        <p className="mt-4 text-slate-500">
          Who is online, and how long learners have spent active on the platform. A gap of 5 minutes or more
          with no activity counts as a break. Times are shown in your local time zone.
        </p>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Active now" value={String(activeNow)} />
        <Stat label="Online (active or idle)" value={String(online)} />
        <Stat label="Total active time in range" value={formatDuration(totalWorked)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
          {(
            [
              ["today", "Today"],
              ["7d", "Last 7 days"],
              ["30d", "Last 30 days"],
              ["custom", "Custom"],
            ] as [RangeKey, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`px-3 py-2 font-medium transition ${
                range === k ? "bg-pd-red text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
            <span className="text-slate-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
          </div>
        )}
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email or location..."
            className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-pd-red"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "online")}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Everyone</option>
          <option value="online">Online only</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAdmins} onChange={(e) => setShowAdmins(e.target.checked)} />
          Include admins
        </label>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          title="Refreshes automatically every 30 seconds"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-slate-400" size={26} />
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full whitespace-nowrap text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold">Learner</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Currently in</th>
                  <th className="px-4 py-3 font-semibold">First active</th>
                  <th className="px-4 py-3 font-semibold">Last active</th>
                  <th className="px-4 py-3 text-right font-semibold">Active time</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {table.map(({ user: u, a }) => (
                  <tr key={u.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{u.full_name || u.email}</p>
                      <p className="text-xs text-slate-500">
                        {u.email}
                        {u.location ? ` · ${u.location}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} lastSeen={a.last_seen_at} lastActive={a.last_active_at} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.status !== "offline" ? a.current_course ?? "Dashboard / other pages" : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{fmtWhen(a.first_active, range)}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtWhen(a.last_active, range)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {a.worked_ms ? formatDuration(a.worked_ms) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/activity/${u.id}?${qs}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Activity size={13} />
                        Timeline
                      </Link>
                    </td>
                  </tr>
                ))}
                {table.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      No learners match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtWhen(iso: string | null, range: RangeKey) {
  if (!iso) return "—";
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return range === "today" ? t : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${t}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
