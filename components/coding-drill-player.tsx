"use client";

import { useMemo, useRef, useState } from "react";
import {
  Loader2,
  Trash2,
  RotateCcw,
  CheckCircle2,
  X,
  BarChart3,
} from "lucide-react";
import { DrillVideo, type DrillVideoHandle } from "@/components/drill-video";
import { DrillSummary } from "@/components/drill-summary";
import {
  parseDrillConfig,
  statColor,
  formatDrillTime,
  gradeDrill,
  type DrillEvent,
  type GradeResult,
} from "@/lib/coding-drill";

type Props = {
  blockId: string;
  content: string | null;
  /** fired after a successful grade+submit (used to mark the lesson complete) */
  onGraded?: () => void;
};

export function CodingDrillPlayer({ blockId, content, onGraded }: Props) {
  const config = useMemo(() => parseDrillConfig(content), [content]);
  const videoRef = useRef<DrillVideoHandle>(null);

  const [events, setEvents] = useState<DrillEvent[]>([]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  if (!config.videoUrl) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">
        This coding drill has no video configured yet.
      </div>
    );
  }

  function logEvent(stat: string) {
    if (result) return; // locked after submit until retry
    const t = videoRef.current?.getCurrentTime() ?? 0;
    const ev: DrillEvent = { stat, t: Math.round(t * 10) / 10 };
    setEvents((prev) => [...prev, ev].sort((a, b) => a.t - b.t));
  }

  function removeEvent(index: number) {
    if (result) return;
    setEvents((prev) => prev.filter((_, i) => i !== index));
  }

  function seekTo(t: number) {
    videoRef.current?.seekTo(t);
  }

  async function submit() {
    setSubmitting(true);
    const graded = gradeDrill(config.master, events, config.tolerance);
    setResult(graded);
    setAttemptCount((c) => c + 1);

    // Persist the attempt (multiple attempts allowed).
    try {
      await fetch("/api/coding-drill/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block_id: blockId,
          score: graded.exact,
          accuracy: Math.round(graded.accuracy * 100),
          exact: graded.exact,
          missed: graded.missed,
          extra: graded.extra,
          events,
        }),
      });
    } catch {
      // Non-fatal: grading still shows locally even if save fails.
    }
    setSubmitting(false);
    onGraded?.();
  }

  function retry() {
    setEvents([]);
    setResult(null);
    videoRef.current?.seekTo(0);
  }

  const acc = result ? Math.round(result.accuracy * 100) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
        {/* LEFT: video + vertical stat column */}
        <div className="min-w-0">
          <div className="flex">
            {/* 16:9 video box, capped so it stays usable on large screens */}
            <div className="relative aspect-video max-h-[72vh] min-w-0 flex-1 bg-black">
              <DrillVideo
                ref={videoRef}
                url={config.videoUrl}
                start={config.startTime}
                end={config.endTime}
                className="h-full w-full"
              />
            </div>

            {/* Vertical stat column on the right of the video */}
            <div className="flex w-36 shrink-0 flex-col gap-2 overflow-y-auto border-l border-slate-200 bg-slate-50 p-2.5">
              {config.stats.map((stat) => (
                <button
                  key={stat}
                  type="button"
                  disabled={!!result}
                  onClick={() => logEvent(stat)}
                  className="rounded-lg px-2 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: statColor(stat) }}
                >
                  {stat}
                </button>
              ))}
            </div>
          </div>

          {/* Instruction */}
          <div className="border-t border-slate-200 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">
              {result
                ? "Submitted — review your result, then retry to try again."
                : "Click a stat the moment it happens in the video."}
            </p>
          </div>
        </div>

        {/* RIGHT: timeline */}
        <div className="flex flex-col border-t border-slate-200 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {showSummary ? "Summary" : "Your timeline"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSummary((s) => !s)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                  showSummary
                    ? "bg-pd-red text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
                }`}
                title="Show total coded per stat"
              >
                <BarChart3 size={13} />
                {showSummary ? "Timeline" : "Summary"}
              </button>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {events.length}
              </span>
            </div>
          </div>

          {showSummary && (
            <div className="max-h-[360px] min-h-[160px] flex-1 overflow-y-auto p-2">
              <DrillSummary
                stats={config.stats}
                events={events}
                countLabel="You"
                // Only reveal the master counts once the attempt is graded.
                compareEvents={result ? config.master : undefined}
                compareLabel="Master"
              />
              {!result && (
                <p className="mt-2 px-1 text-[11px] text-slate-400">
                  Master counts are shown after you submit.
                </p>
              )}
            </div>
          )}

          <div
            className={`max-h-[360px] min-h-[160px] flex-1 overflow-y-auto p-2 ${
              showSummary ? "hidden" : ""
            }`}
          >
            {events.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-slate-400">
                No events logged yet.
              </p>
            ) : (
              <div className="space-y-1">
                {events.map((e, i) => {
                  // After grading, color-code whether this event matched.
                  const matchedDetail = result?.detail.find(
                    (d) => d.matched && d.learnerT === e.t && d.stat === e.stat
                  );
                  const isExtra = result && !matchedDetail;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        isExtra ? "bg-red-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: statColor(e.stat) }}
                      />
                      <button
                        type="button"
                        onClick={() => seekTo(e.t)}
                        className="font-mono text-xs text-slate-500 hover:text-pd-red"
                      >
                        {formatDrillTime(e.t)}
                      </button>
                      <span className="font-medium text-slate-800">
                        {e.stat}
                      </span>
                      {result ? (
                        isExtra ? (
                          <span className="ml-auto text-[10px] font-semibold uppercase text-red-500">
                            extra
                          </span>
                        ) : (
                          <CheckCircle2
                            size={14}
                            className="ml-auto text-emerald-500"
                          />
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeEvent(i)}
                          className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-slate-200 p-3">
            {!result ? (
              <button
                type="button"
                onClick={submit}
                disabled={submitting || events.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Submit &amp; grade
              </button>
            ) : (
              <button
                type="button"
                onClick={retry}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RotateCcw size={15} />
                Try again
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Result summary */}
      {result && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold ${
                  acc >= 90
                    ? "text-emerald-600"
                    : acc >= 70
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                {acc}%
              </span>
              <span className="text-sm text-slate-500">accuracy</span>
            </div>
            <div className="flex gap-3 text-sm">
              <span className="text-emerald-600">
                {result.exact} correct
              </span>
              <span className="text-red-500">{result.missed} missed</span>
              <span className="text-red-500">
                {result.extra} extra (incorrect)
              </span>
            </div>
            <span className="ml-auto text-xs text-slate-400">
              Attempt {attemptCount}
            </span>
          </div>

          {/* Missed master events, so the learner can see what they missed */}
          {result.detail.some((d) => !d.matched) && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Missed events
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.detail
                  .filter((d) => !d.matched)
                  .map((d, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => seekTo(d.t)}
                      title="Jump to this moment in the video"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200 hover:ring-pd-red"
                    >
                      <X size={11} className="text-red-500" />
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: statColor(d.stat) }}
                      />
                      {d.stat} @ {formatDrillTime(d.t)}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
