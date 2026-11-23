"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { ActivityTimeline, EVENT_STYLE, type TimelineEvent } from "@/components/activity-timeline";
import { StatusBadge } from "@/components/activity-status";
import {
  BREAK_MS,
  formatDuration,
  summariseDays,
  type PresenceStatus,
  type Segment,
} from "@/lib/activity";

type Detail = {
  segments: Segment[];
  events?: TimelineEvent[];
  courses: Record<string, string>;
  per_course: { course_id: string | null; title: string; ms: number }[];
  presence: {
    status: PresenceStatus;
    last_seen_at?: string | null;
    last_active_at?: string | null;
    course_title?: string | null;
  };
};

const toInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Live status + daily activity timeline + activity log for one learner. */
export function LearnerActivityPanel({ userId }: { userId: string }) {
  const [from, setFrom] = useState(() => {
    const f = new Date();
    f.setDate(f.getDate() - 6);
    return toInput(f);
  });
  const [to, setTo] = useState(() => toInput(new Date()));
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fromDate = useMemo(() => new Date(`${from}T00:00:00`), [from]);
  const toDate = useMemo(() => new Date(`${to}T00:00:00`), [to]);

  const load = useCallback(async () => {
    const end = new Date(toDate);
    end.setDate(end.getDate() + 1);
    const res = await fetch(
      `/api/admin/activity?user_id=${userId}&from=${encodeURIComponent(fromDate.toISOString())}&to=${encodeURIComponent(
        end.toISOString()
      )}`
    );
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setError(d.error || "Couldn't load activity.");
    else {
      setError("");
      setData(d);
    }
    setLoading(false);
  }, [userId, fromDate, toDate]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const days = useMemo(
    () => (data ? summariseDays(data.segments, fromDate, toDate) : []),
    [data, fromDate, toDate]
  );
  const totals = useMemo(() => {
    const worked = days.reduce((n, d) => n + d.workedMs, 0);
    const used = days.reduce((n, d) => n + d.usedMs, 0);
    // A day counts as active with live tracking OR any action the learner did.
    const ownEventDays = new Set(
      (data?.events ?? [])
        .filter((e) => e.kind !== "assigned")
        .map((e) => new Date(e.at).toDateString())
    );
    const activeDays = days.filter((d) => d.first !== null || ownEventDays.has(new Date(d.day).toDateString())).length;
    return { worked, used, breaks: Math.max(0, used - worked), activeDays, actions: (data?.events ?? []).filter((e) => e.kind !== "assigned").length };
  }, [days, data]);

  const liveEnd = useMemo(() => {
    if (!data || data.presence.status !== "active" || data.segments.length === 0) return null;
    const last = Math.max(...data.segments.map((s) => Date.parse(s.ended_at)));
    return Date.now() - last < BREAK_MS ? last : null;
  }, [data]);

  function setPreset(daysBack: number) {
    const t = new Date();
    const f = new Date(t);
    f.setDate(f.getDate() - daysBack);
    setFrom(toInput(f));
    setTo(toInput(t));
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {data && (
          <StatusBadge
            status={data.presence.status}
            lastSeen={data.presence.last_seen_at ?? null}
            lastActive={data.presence.last_active_at ?? null}
          />
        )}
        {data && data.presence.status !== "offline" && (
          <span className="text-xs text-slate-500">
            in {data.presence.course_title ?? "dashboard / other pages"}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Active time" value={formatDuration(totals.worked)} tone="text-green-700" />
        <Stat label="On the platform (first → last)" value={formatDuration(totals.used)} />
        <Stat label="Breaks (5+ min idle)" value={formatDuration(totals.breaks)} tone="text-red-500" />
        <Stat label="Days active" value={`${totals.activeDays}${totals.actions ? ` · ${totals.actions} actions` : ""}`} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Activity timeline</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
            <span className="text-slate-500">To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
            <button onClick={() => setPreset(0)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              Today
            </button>
            <button onClick={() => setPreset(6)} className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 font-medium text-white hover:bg-green-800">
              <CalendarRange size={14} />
              Last 7 days
            </button>
            <button onClick={() => setPreset(29)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              30 days
            </button>
            <button onClick={() => setPreset(89)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
              90 days
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-slate-400" size={24} />
          </div>
        ) : (
          <ActivityTimeline days={days} courseTitles={data?.courses ?? {}} liveSegmentEnd={liveEnd} events={data?.events ?? []} />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-4 font-semibold text-slate-900">
            Active time per course <span className="font-normal text-slate-400">(selected dates)</span>
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {(data?.per_course ?? []).map((c) => (
                <tr key={c.course_id ?? "none"}>
                  <td className={`px-5 py-3 ${c.course_id ? "font-medium text-slate-900" : "text-slate-500"}`}>{c.title}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatDuration(c.ms)}</td>
                  <td className="w-40 px-5 py-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-green-700"
                        style={{ width: `${totals.worked ? Math.min(100, (c.ms / totals.worked) * 100) : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.per_course ?? []).length === 0 && (
                <tr>
                  <td className="px-5 py-10 text-center text-slate-400">No activity in this range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-200 px-5 py-4 font-semibold text-slate-900">Activity log</h2>
          <div className="max-h-[480px] overflow-y-auto">
            {days
              .map((d) => ({
                d,
                evs: (data?.events ?? []).filter((e) => {
                  const s = Date.parse(e.at);
                  return s >= d.day && s < d.day + 24 * 3600_000;
                }),
              }))
              .filter(({ d, evs }) => d.first !== null || evs.length > 0)
              .map(({ d, evs }) => {
                const items: { kind: string; start: number; end: number; course: string | null; label?: string }[] = [];
                const segs = [...d.segments].sort((a, b) => a.start - b.start);
                let lastEnd: number | null = null;
                for (const s of segs) {
                  if (lastEnd !== null && s.start - lastEnd >= BREAK_MS) {
                    items.push({ kind: "break", start: lastEnd, end: s.start, course: null });
                  }
                  items.push({ kind: "active", start: s.start, end: s.end, course: s.courseId });
                  lastEnd = Math.max(lastEnd ?? 0, s.end);
                }
                for (const e of evs) {
                  items.push({
                    kind: e.kind,
                    start: Date.parse(e.at),
                    end: e.end ? Date.parse(e.end) : Date.parse(e.at),
                    course: null,
                    label: e.label,
                  });
                }
                items.sort((a, b) => a.start - b.start || (a.kind === "active" ? -1 : 1));
                return (
                  <div key={d.day} className="border-b border-slate-100 last:border-0">
                    <p className="sticky top-0 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {new Date(d.day).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}
                    </p>
                    <table className="w-full text-sm">
                      <tbody>
                        {items.reverse().map((it, i) => (
                          <tr key={i} className={it.kind === "break" ? "bg-red-50/60" : ""}>
                            <td className="w-32 whitespace-nowrap px-5 py-2 tabular-nums text-slate-600">
                              {it.end > it.start ? `${time(it.start)}–${time(it.end)}` : time(it.start)}
                            </td>
                            <td className="px-2 py-2">
                              {it.kind === "break" ? (
                                <span className="text-red-500">Break</span>
                              ) : it.kind !== "active" ? (
                                <span className="inline-flex items-center gap-2 text-slate-700">
                                  <span className={`h-2 w-2 shrink-0 rounded-full ${EVENT_STYLE[it.kind]?.dot ?? "bg-slate-400"}`} />
                                  {it.label}
                                </span>
                              ) : (
                                <span className="text-slate-800">
                                  {it.course ? data?.courses[it.course] ?? "Course" : "Dashboard / other pages"}
                                </span>
                              )}
                            </td>
                            <td className={`px-5 py-2 text-right tabular-nums ${it.kind === "break" ? "text-red-500" : it.kind === "active" ? "font-medium text-green-700" : "text-slate-400"}`}>
                              {it.end > it.start ? formatDuration(it.end - it.start) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            {totals.activeDays === 0 && (data?.events ?? []).length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-slate-400">No activity in this range.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
