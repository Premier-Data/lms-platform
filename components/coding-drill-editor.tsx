"use client";

import { useRef, useState } from "react";
import { Plus, X, Trash2, Film } from "lucide-react";
import { VideoUpload } from "@/components/video-upload";
import { DrillVideo, type DrillVideoHandle } from "@/components/drill-video";
import {
  parseDrillConfig,
  statColor,
  formatDrillTime,
  DEFAULT_DRILL_STATS,
  type DrillConfig,
  type DrillEvent,
} from "@/lib/coding-drill";

type Props = {
  /** current block content (jsonb/string) */
  value: string | null;
  /** called with the serialized JSON string to store in block.content */
  onChange: (serialized: string) => void;
};

export function CodingDrillEditor({ value, onChange }: Props) {
  const [config, setConfig] = useState<DrillConfig>(() =>
    parseDrillConfig(value)
  );
  const videoRef = useRef<DrillVideoHandle>(null);
  const [newStat, setNewStat] = useState("");

  function commit(next: DrillConfig) {
    setConfig(next);
    onChange(JSON.stringify(next));
  }

  function setVideo(url: string) {
    commit({ ...config, videoUrl: url });
  }

  function setTolerance(t: number) {
    commit({ ...config, tolerance: t });
  }

  function addStat() {
    const s = newStat.trim();
    if (!s || config.stats.includes(s)) {
      setNewStat("");
      return;
    }
    commit({ ...config, stats: [...config.stats, s] });
    setNewStat("");
  }

  function removeStat(stat: string) {
    commit({ ...config, stats: config.stats.filter((s) => s !== stat) });
  }

  function logMaster(stat: string) {
    const t = videoRef.current?.getCurrentTime() ?? 0;
    const event: DrillEvent = { stat, t: Math.round(t * 10) / 10 };
    const master = [...config.master, event].sort((a, b) => a.t - b.t);
    commit({ ...config, master });
  }

  function removeMaster(index: number) {
    commit({
      ...config,
      master: config.master.filter((_, i) => i !== index),
    });
  }

  function seekTo(t: number) {
    videoRef.current?.seekTo(t);
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Film size={16} className="text-pd-red" />
        Coding Drill
      </div>

      {/* Video */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500">
          Drill video{" "}
          <span className="font-normal text-slate-400">
            — paste a YouTube link or upload a clip
          </span>
        </label>
        <VideoUpload
          value={config.videoUrl}
          onChange={setVideo}
          hidePreview
        />
      </div>

      {config.videoUrl && (
        <>
          {/* Video preview used to build the master timeline */}
          <div className="overflow-hidden rounded-xl bg-slate-900">
            <DrillVideo
              ref={videoRef}
              url={config.videoUrl}
              className="aspect-video max-h-80 w-full"
            />
          </div>

          {/* Tolerance */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500">
              Match tolerance
            </label>
            <div className="flex gap-1">
              {[2, 3, 5].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTolerance(t)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    config.tolerance === t
                      ? "bg-pd-red text-white"
                      : "bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  ±{t}s
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">
              How close a learner&apos;s click must be to count as correct.
            </span>
          </div>

          {/* Stat buttons (used to build master + shown to learners) */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Stats — play the video and click a stat to add it to the master
              timeline
            </label>
            <div className="flex flex-wrap gap-2">
              {config.stats.map((stat) => (
                <div key={stat} className="group relative">
                  <button
                    type="button"
                    onClick={() => logMaster(stat)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                    style={{ backgroundColor: statColor(stat) }}
                  >
                    {stat}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStat(stat)}
                    title={`Remove ${stat}`}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white group-hover:flex"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add stat */}
            <div className="mt-2 flex items-center gap-2">
              <input
                value={newStat}
                onChange={(e) => setNewStat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStat();
                  }
                }}
                placeholder="Add a stat (e.g. Tackle)"
                className="w-48 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-pd-red"
              />
              <button
                type="button"
                onClick={addStat}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <Plus size={13} /> Add
              </button>
              {config.stats.length === 0 && (
                <button
                  type="button"
                  onClick={() =>
                    commit({ ...config, stats: [...DEFAULT_DRILL_STATS] })
                  }
                  className="text-xs font-medium text-pd-red hover:underline"
                >
                  Reset to defaults
                </button>
              )}
            </div>
          </div>

          {/* Master timeline */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-500">
                Master timeline ({config.master.length})
              </label>
              {config.master.length > 0 && (
                <button
                  type="button"
                  onClick={() => commit({ ...config, master: [] })}
                  className="text-xs font-medium text-slate-400 hover:text-red-600"
                >
                  Clear all
                </button>
              )}
            </div>
            {config.master.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-400">
                No master events yet. Play the video and click a stat at the
                moment it happens.
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {config.master.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: statColor(e.stat) }}
                    />
                    <button
                      type="button"
                      onClick={() => seekTo(e.t)}
                      className="font-mono text-xs text-slate-500 hover:text-pd-red"
                      title="Jump to this moment"
                    >
                      {formatDrillTime(e.t)}
                    </button>
                    <span className="font-medium text-slate-800">{e.stat}</span>
                    <button
                      type="button"
                      onClick={() => removeMaster(i)}
                      className="ml-auto rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
