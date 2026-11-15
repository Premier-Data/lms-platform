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
  /** optional per-stat colour overrides (hex), keyed by stat label */
  statColors?: Record<string, string>;
  /** optional clip start (seconds). 0 or undefined = from the beginning */
  startTime?: number;
  /** optional clip end (seconds). 0 or undefined = to the end */
  endTime?: number;
  /** optional instructions shown to learners above the video */
  description?: string;
  /**
   * optional pass mark (1-100, % accuracy). Learners at or above it pass the
   * drill; when unset any graded attempt completes the lesson.
   */
  passMark?: number;
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

// Palette used to give custom stats distinct colours by default.
export const STAT_PALETTE = [
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0d9488", // teal
  "#ca8a04", // yellow
  "#475569", // slate
];

/**
 * Colour for a stat: admin override first, then the built-in colour, then a
 * stable palette colour derived from the label so custom stats differ.
 */
export function statColor(
  stat: string,
  overrides?: Record<string, string>
): string {
  const o = overrides?.[stat];
  if (o) return o;
  if (STAT_COLORS[stat]) return STAT_COLORS[stat];
  let h = 0;
  for (let i = 0; i < stat.length; i++) h = (h * 31 + stat.charCodeAt(i)) >>> 0;
  return STAT_PALETTE[h % STAT_PALETTE.length];
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

  const statColors: Record<string, string> = {};
  if (obj.statColors && typeof obj.statColors === "object") {
    for (const [k, v] of Object.entries(
      obj.statColors as Record<string, unknown>
    )) {
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) {
        statColors[k] = v;
      }
    }
  }

  const description =
    typeof obj.description === "string" && obj.description.trim()
      ? obj.description
      : undefined;

  const passMark =
    typeof obj.passMark === "number" && obj.passMark > 0 && obj.passMark <= 100
      ? Math.round(obj.passMark)
      : undefined;

  return {
    videoUrl,
    tolerance,
    master,
    stats,
    statColors,
    startTime,
    endTime,
    description,
    passMark,
  };
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

// Floating-point slack so a click exactly "tolerance" seconds away still counts.
const EPS = 1e-6;
// Cost of an impossible pairing; larger than any sum of real time differences
// so the matcher always prefers more matches first.
const NO_MATCH = 1e6;

/**
 * Minimum-cost assignment (Hungarian algorithm). `cost` must have rows <= cols.
 * Returns, for each row, the column it is assigned to.
 */
function assignMinCost(cost: number[][]): number[] {
  const n = cost.length;
  const m = n > 0 ? cost[0].length : 0;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const ans = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] !== 0) ans[p[j] - 1] = j - 1;
  return ans;
}

/**
 * Grade a learner timeline against the master.
 *
 * A learner click matches a master event when it has the same stat and is
 * within `tolerance` seconds. Pairings are chosen globally, per stat: first
 * the largest possible number of matches, then the smallest total time
 * difference. This means a click is never "stolen" by a neighbouring master
 * event when it sits closer to another one.
 */
export function gradeDrill(
  master: DrillEvent[],
  learner: DrillEvent[],
  tolerance: number
): GradeResult {
  // Sort master by time for stable, intuitive output.
  const masterSorted = [...master].sort((a, b) => a.t - b.t);
  const matchOf = new Map<number, number>(); // master index -> learner index

  const stats = new Set(masterSorted.map((m) => m.stat));
  for (const stat of stats) {
    const mi = masterSorted
      .map((m, i) => (m.stat === stat ? i : -1))
      .filter((i) => i >= 0);
    const li = learner
      .map((l, i) => (l.stat === stat ? i : -1))
      .filter((i) => i >= 0);
    if (mi.length === 0 || li.length === 0) continue;

    const costOf = (a: number, b: number) => {
      const d = Math.abs(learner[li[b]].t - masterSorted[mi[a]].t);
      return d <= tolerance + EPS ? d : NO_MATCH;
    };

    if (mi.length <= li.length) {
      const cost = mi.map((_, a) => li.map((__, b) => costOf(a, b)));
      assignMinCost(cost).forEach((b, a) => {
        if (b >= 0 && cost[a][b] < NO_MATCH) matchOf.set(mi[a], li[b]);
      });
    } else {
      // More master events than clicks: assign clicks to master events.
      const cost = li.map((_, b) => mi.map((__, a) => costOf(a, b)));
      assignMinCost(cost).forEach((a, b) => {
        if (a >= 0 && cost[b][a] < NO_MATCH) matchOf.set(mi[a], li[b]);
      });
    }
  }

  const detail: GradeResult["detail"] = masterSorted.map((m, i) => {
    const l = matchOf.get(i);
    return l === undefined
      ? { stat: m.stat, t: m.t, matched: false, learnerT: null }
      : { stat: m.stat, t: m.t, matched: true, learnerT: learner[l].t };
  });

  const exact = matchOf.size;
  const missed = masterSorted.length - exact;
  const extra = learner.length - exact;
  const masterTotal = masterSorted.length;
  // Accuracy penalises BOTH missed master events and extra (wrong) clicks:
  // correct out of (everything they should have caught + everything they
  // wrongly added). So each miss and each extra each cost one.
  const denom = masterTotal + extra;
  const accuracy = denom > 0 ? exact / denom : 0;

  return { exact, missed, extra, masterTotal, accuracy, detail };
}

/** Whether an attempt reaches the drill's pass mark (no pass mark = always). */
export function isDrillPassed(
  accuracy: number, // 0..1
  passMark: number | undefined
): boolean {
  if (!passMark) return true;
  return Math.round(accuracy * 100) >= passMark;
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
