// Helpers for the per-lesson "time spent" a learner accumulates. Time is kept
// in the learner's course progress JSON as { time_spent: { [lessonId]: seconds } }.

/** Pull a clean { lessonId: seconds } map out of an assignment's progress JSON. */
export function readTimeSpent(progress: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!progress || typeof progress !== "object") return out;
  const raw = (progress as { time_spent?: unknown }).time_spent;
  if (!raw || typeof raw !== "object") return out;
  for (const [lessonId, secs] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof secs === "number" && Number.isFinite(secs) && secs > 0) {
      out[lessonId] = Math.round(secs);
    }
  }
  return out;
}

/** 0 -> "—", 45 -> "45s", 190 -> "3m 10s", 7500 -> "2h 5m". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m ${s % 60}s`;
  return `${h}h ${m}m`;
}
