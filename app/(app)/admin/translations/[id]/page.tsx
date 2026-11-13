"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Languages, Save, RotateCcw } from "lucide-react";
import { runTranslation } from "@/lib/translations/client";

type Item = {
  key: string;
  entity: string;
  id: string;
  field: string;
  label: string;
  html: boolean;
  en: string;
  vi: string | null;
  edited: boolean;
  status: "missing" | "ok" | "outdated";
};

type Filter = "all" | "missing" | "outdated" | "edited";

const badge: Record<Item["status"], string> = {
  ok: "bg-green-100 text-green-700",
  outdated: "bg-amber-100 text-amber-700",
  missing: "bg-red-100 text-red-600",
};
const badgeLabel: Record<Item["status"], string> = {
  ok: "Translated",
  outdated: "Outdated",
  missing: "Missing",
};

export default function ReviewTranslationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: courseId } = use(params);

  const [title, setTitle] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch(`/api/admin/translate?courseId=${courseId}`);
    if (res.ok) {
      const data = await res.json();
      setTitle(data.course?.title ?? "");
      setItems(data.items ?? []);
      setConfigured(data.configured !== false);
      setDrafts({});
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const shown = useMemo(
    () =>
      items.filter((i) =>
        filter === "all"
          ? true
          : filter === "edited"
            ? i.edited
            : i.status === filter
      ),
    [items, filter]
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      missing: items.filter((i) => i.status === "missing").length,
      outdated: items.filter((i) => i.status === "outdated").length,
      edited: items.filter((i) => i.edited).length,
    }),
    [items]
  );

  async function translateCourse() {
    setBulkBusy(true);
    setMessage("");
    const r = await runTranslation(courseId, {}, (d, left) =>
      setMessage(`${d} translated, ${left} left…`)
    );
    setMessage(r.ok ? `Done — ${r.translated} strings translated.` : r.error);
    setBulkBusy(false);
    await load();
  }

  async function retranslate(item: Item) {
    setBusyKey(item.key);
    setMessage("");
    const r = await runTranslation(courseId, { keys: [item.key], force: true });
    if (!r.ok) setMessage(r.error);
    setBusyKey(null);
    await load();
  }

  async function save(item: Item) {
    const text = drafts[item.key];
    if (text === undefined) return;
    setBusyKey(item.key);
    setMessage("");
    const res = await fetch("/api/admin/translate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId,
        entity: item.entity,
        id: item.id,
        field: item.field,
        text,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMessage(d.error || "Couldn't save.");
    }
    setBusyKey(null);
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/translations"
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={18} />
        All translations
      </Link>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
          <p className="mt-3 text-sm text-slate-500">
            Review and edit the Vietnamese version. Clear a box and save to fall
            back to English for that string.
          </p>
        </div>
        <button
          onClick={translateCourse}
          disabled={
            !configured ||
            bulkBusy ||
            counts.missing + counts.outdated === 0
          }
          className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
        >
          {bulkBusy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Languages size={16} />
          )}
          Translate missing &amp; outdated
        </button>
      </div>

      {!configured && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Automatic translation isn&apos;t set up (ANTHROPIC_API_KEY missing).
          You can still type translations by hand.
        </p>
      )}
      {message && <p className="mb-4 text-sm text-slate-600">{message}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "missing", "outdated", "edited"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${
              filter === f
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {shown.map((item) => {
          const draft = drafts[item.key];
          const value = draft ?? item.vi ?? "";
          const dirty = draft !== undefined && draft !== (item.vi ?? "");
          return (
            <div
              key={item.key}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">
                  {item.label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge[item.status]}`}
                >
                  {badgeLabel[item.status]}
                </span>
                {item.edited && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    Hand-edited
                  </span>
                )}
                {item.html && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    HTML
                  </span>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    English
                  </p>
                  <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    {item.en}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Tiếng Việt
                  </p>
                  <textarea
                    value={value}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [item.key]: e.target.value }))
                    }
                    rows={Math.min(8, Math.max(2, Math.ceil(item.en.length / 60)))}
                    className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-pd-red"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => retranslate(item)}
                      disabled={!configured || busyKey === item.key}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <RotateCcw size={13} />
                      Re-translate
                    </button>
                    <button
                      onClick={() => save(item)}
                      disabled={!dirty || busyKey === item.key}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                    >
                      {busyKey === item.key ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Save size={13} />
                      )}
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            Nothing to show here.
          </p>
        )}
      </div>
    </div>
  );
}
