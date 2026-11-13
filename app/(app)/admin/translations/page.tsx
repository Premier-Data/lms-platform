"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Languages, AlertTriangle, CheckCircle2 } from "lucide-react";
import { runTranslation } from "@/lib/translations/client";

type CourseRow = {
  id: string;
  title: string;
  status: string;
  total: number;
  ok: number;
  outdated: number;
  missing: number;
};

export default function TranslationsPage() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/translate");
    if (res.ok) {
      const data = await res.json();
      setCourses(data.courses ?? []);
      setConfigured(data.configured !== false);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function translateOne(c: CourseRow) {
    setBusyId(c.id);
    setError("");
    setProgress("");
    const r = await runTranslation(c.id, {}, (done, left) =>
      setProgress(`${c.title}: ${done} done, ${left} left…`)
    );
    if (!r.ok) setError(r.error);
    setBusyId(null);
    setProgress("");
    await load();
  }

  async function translateAll() {
    setError("");
    for (const c of courses.filter((c) => c.missing + c.outdated > 0)) {
      setBusyId(c.id);
      const r = await runTranslation(c.id, {}, (done, left) =>
        setProgress(`${c.title}: ${done} done, ${left} left…`)
      );
      if (!r.ok) {
        setError(r.error);
        break;
      }
    }
    setBusyId(null);
    setProgress("");
    await load();
  }

  const pending = courses.reduce((n, c) => n + c.missing + c.outdated, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-slate-400" size={28} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Translations
        </h1>
        <div className="mt-3 h-1 w-12 rounded-full bg-pd-red" />
        <p className="mt-4 text-slate-500">
          Vietnamese versions of your course content. Learners who choose VI see
          these; anything not translated falls back to English.
        </p>
      </div>

      {!configured && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            Automatic translation isn&apos;t set up yet. Add{" "}
            <code className="rounded bg-amber-100 px-1">ANTHROPIC_API_KEY</code>{" "}
            to the environment (see the notes below). You can still write
            Vietnamese by hand from each course&apos;s Review page.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {pending > 0
            ? `${pending} strings need translating across ${
                courses.filter((c) => c.missing + c.outdated > 0).length
              } courses.`
            : "Everything is translated and up to date."}
        </p>
        <button
          onClick={translateAll}
          disabled={!configured || busyId !== null || pending === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
        >
          {busyId ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Languages size={16} />
          )}
          Translate all courses
        </button>
      </div>
      {progress && <p className="mb-3 text-xs text-slate-500">{progress}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Course</th>
              <th className="px-4 py-3 text-right font-semibold">Strings</th>
              <th className="px-4 py-3 text-right font-semibold">Translated</th>
              <th className="px-4 py-3 text-right font-semibold">Outdated</th>
              <th className="px-4 py-3 text-right font-semibold">Missing</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {c.title}
                  {c.status !== "published" && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {c.status}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.total}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700">
                  {c.ok}
                  {c.total > 0 && c.ok === c.total && (
                    <CheckCircle2 size={14} className="ml-1 inline" />
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-600">
                  {c.outdated}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-red-500">
                  {c.missing}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => translateOne(c)}
                      disabled={
                        !configured ||
                        busyId !== null ||
                        c.missing + c.outdated === 0
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      {busyId === c.id && (
                        <Loader2 size={13} className="animate-spin" />
                      )}
                      Translate
                    </button>
                    <Link
                      href={`/admin/translations/${c.id}`}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                    >
                      Review
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  No courses yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
