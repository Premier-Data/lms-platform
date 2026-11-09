"use client";

import { statColor, type DrillEvent } from "@/lib/coding-drill";

type Props = {
  /** the stat labels to list (in button order) */
  stats: string[];
  /** events to count (learner timeline or master timeline) */
  events: DrillEvent[];
  /** label for the count column, e.g. "Coded" or "Master" */
  countLabel?: string;
  /** optional master events — when provided, shown as a comparison column */
  compareEvents?: DrillEvent[];
  compareLabel?: string;
};

function countBy(events: DrillEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) m.set(e.stat, (m.get(e.stat) ?? 0) + 1);
  return m;
}

/** Table of how many times each stat label has been coded. */
export function DrillSummary({
  stats,
  events,
  countLabel = "Coded",
  compareEvents,
  compareLabel = "Master",
}: Props) {
  const counts = countBy(events);
  const compare = compareEvents ? countBy(compareEvents) : null;

  // Include any stat that was coded but is no longer in the button set.
  const labels = [
    ...stats,
    ...Array.from(counts.keys()).filter((s) => !stats.includes(s)),
  ];

  const total = events.length;
  const compareTotal = compareEvents?.length ?? 0;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Stat</th>
            <th className="px-3 py-2 text-right font-semibold">
              {countLabel}
            </th>
            {compare && (
              <th className="px-3 py-2 text-right font-semibold">
                {compareLabel}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {labels.map((stat) => {
            const c = counts.get(stat) ?? 0;
            const m = compare?.get(stat) ?? 0;
            return (
              <tr key={stat}>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-2 font-medium text-slate-800">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: statColor(stat) }}
                    />
                    {stat}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-slate-800">
                  {c}
                </td>
                {compare && (
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                      m === c ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {m}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{total}</td>
            {compare && (
              <td className="px-3 py-2 text-right tabular-nums">
                {compareTotal}
              </td>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
