// Shared types and grading logic for the "coding drill" lesson block.
//
// A coding drill presents a video with stat buttons overlaid. The learner
// clicks a stat at the moment it happens; each click logs an event with the
// current video timestamp. The learner's timeline is then graded against a
// master timeline defined by the admin: each master event must be matched by
// a learner event with the same stat within a time tolerance.

export type DrillEvent = {
  /** stat label, e.g. "Pass", "Goal" */
  stat: string;
  /** video timestamp in seconds */
  t: number;
};

export type DrillConfig = {
  videoUrl: string;
  /** seconds of tolerance when matching learner events to master events */
  tolerance: number;
  /** the correct/master timeline */
  master: DrillEvent[];
  /** the stat buttons shown to the learner */
  stats: string[];
  /** optional clip start (seconds). 0 or undefined = from the beginning */
  startTime?: number;
  /** optional clip end (seconds). 0 or undefined = to the end */
  endTime?: number;
};

// Default stat set (more can be added later by admins per drill).
export const DEFAULT_DRILL_STATS = [
  "Pass",
  "Goal",
  "Corner",
  "Free Kick",
  "Throw In",
];

// A color per stat so buttons/timeline are visually distinct. Falls back to a
// neutral slate for any stat not in the map.
export const STAT_COLORS: Record<string, string> = {
  Pass: "#2563eb", // blue
  Goal: "#dc2626", // red
  Corner: "#d97706", // amber
  "Free Kick": "#16a34a", // green
  "Throw In": "#9333ea", // purple
};

export function statColor(stat: string): string {
  return STAT_COLORS[stat] ?? "#475569";
}

export function emptyDrillConfig(): DrillConfig {
  return {
    videoUrl: "",
    tolerance: 3,
    master: [],
    stats: [...DEFAULT_DRILL_STATS],
  };
}

/** Parse a block's jsonb/text content into a DrillConfig, tolerant of shape. */
export function parseDrillConfig(raw: unknown): DrillConfig {
  const base = emptyDrillConfig();
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      obj = null;
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return base;

  const videoUrl = typeof obj.videoUrl === "string" ? obj.videoUrl : "";
  const tolerance =
    typeof obj.tolerance === "number" && obj.tolerance > 0
      ? obj.tolerance
      : base.tolerance;
  const stats =
    Array.isArray(obj.stats) && obj.stats.length > 0
      ? (obj.stats.filter((s) => typeof s === "string") as string[])
      : base.stats;
  const master = Array.isArray(obj.master)
    ? (obj.master
        .map((e) => {
          const ev = e as { stat?: unknown; t?: unknown };
          return typeof ev.stat === "string" && typeof ev.t === "number"
            ? { stat: ev.stat, t: ev.t }
            : null;
        })
        .filter(Boolean) as DrillEvent[])
    : [];

  const startTime =
    typeof obj.startTime === "number" && obj.startTime > 0
      ? obj.startTime
      : undefined;
  const endTime =
    typeof obj.endTime === "number" && obj.endTime > 0 ? obj.endTime : undefined;

  return { videoUrl, tolerance, master, stats, startTime, endTime };
}

/** Parse a "mm:ss" or "h:mm:ss" or plain-seconds string to seconds (or null). */
export function parseClipTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return null;
    let seconds = 0;
    for (const p of parts) seconds = seconds * 60 + p;
    return seconds;
  }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

export type GradeResult = {
  exact: number; // master events correctly matched (right stat, within tolerance)
  missed: number; // master events with no matching learner event
  extra: number; // learner events that matched nothing in the master
  masterTotal: number;
  accuracy: number; // exact / masterTotal (0..1)
  /** per master event: matched or not, plus the learner time if matched */
  detail: {
    stat: string;
    t: number;
    matched: boolean;
    learnerT: number | null;
  }[];
};

/**
 * Grade a learner timeline against the master.
 * Greedy best-match: for each master event, consume the nearest unused learner
 * event with the same stat within tolerance.
 */
export function gradeDrill(
  master: DrillEvent[],
  learner: DrillEvent[],
  tolerance: number
): GradeResult {
  const usedLearner = new Set<number>();
  const detail: GradeResult["detail"] = [];
  let exact = 0;

  // Sort master by time for stable, intuitive matching.
  const masterSorted = [...master].sort((a, b) => a.t - b.t);

  for (const m of masterSorted) {
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < learner.length; i++) {
      if (usedLearner.has(i)) continue;
      const l = learner[i];
      if (l.stat !== m.stat) continue;
      const delta = Math.abs(l.t - m.t);
      if (delta > tolerance) continue;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      detail.push({ stat: m.stat, t: m.t, matched: false, learnerT: null });
    } else {
      usedLearner.add(bestIdx);
      exact += 1;
      detail.push({
        stat: m.stat,
        t: m.t,
        matched: true,
        learnerT: learner[bestIdx].t,
      });
    }
  }

  const missed = masterSorted.length - exact;
  const extra = learner.length - usedLearner.size;
  const masterTotal = masterSorted.length;
  const accuracy = masterTotal > 0 ? exact / masterTotal : 0;

  return { exact, missed, extra, masterTotal, accuracy, detail };
}

/** Format seconds as m:ss. */
export function formatDrillTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Extract a YouTube video id from common URL shapes:
 *   https://youtu.be/ID?...                 (short)
 *   https://www.youtube.com/watch?v=ID&...   (watch)
 *   https://www.youtube.com/embed/ID         (embed)
 *   https://www.youtube.com/shorts/ID        (shorts)
 * Returns null if the url isn't a recognised YouTube link.
 */
export function parseYouTubeId(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" || parts[0] === "shorts")
        return parts[1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Optional start time (seconds) from a YouTube url's `t`/`start` param. */
export function parseYouTubeStart(url: string): number {
  try {
    const u = new URL(url.trim());
    const raw = u.searchParams.get("t") ?? u.searchParams.get("start");
    if (!raw) return 0;
    // Supports "90", "90s", "1m30s", "1h2m3s"
    const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!m) return 0;
    const h = parseInt(m[1] ?? "0", 10);
    const min = parseInt(m[2] ?? "0", 10);
    const s = parseInt(m[3] ?? "0", 10);
    return h * 3600 + min * 60 + s;
  } catch {
    return 0;
  }
}

export function isYouTubeUrl(url: string): boolean {
  return parseYouTubeId(url) !== null;
}
