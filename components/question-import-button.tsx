"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  buildImportTemplate,
  lessonRefMatches,
  parseQuestionSheet,
  type ImportParseResult,
  type ImportedQuestion,
} from "@/lib/question-import";
import type { QuestionGate } from "@/lib/question-block";

type Props = {
  lessonId: string;
  /** Import the chosen questions. Throw or reject to show an error. */
  onImport: (
    questions: ImportedQuestion[],
    options: { gate: QuestionGate }
  ) => void | Promise<void>;
  /** Show the "To continue" setting (page questions only). */
  showGate?: boolean;
  /** Describes what each imported question becomes. */
  hint?: string;
};

const TYPE_LABEL: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  short_answer: "Short answer",
};

/** Button + dialog for bulk-importing questions from a Google Sheet or CSV. */
export function QuestionImportButton({
  lessonId,
  onImport,
  showGate = false,
  hint,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [onlyThisLesson, setOnlyThisLesson] = useState(true);
  const [gate, setGate] = useState<QuestionGate>("answered");

  function reset() {
    setSheetUrl("");
    setLoading(false);
    setImporting(false);
    setError("");
    setResult(null);
    setOnlyThisLesson(true);
    setGate("answered");
  }

  function close() {
    setOpen(false);
    reset();
  }

  function loadCsv(csv: string) {
    const parsed = parseQuestionSheet(csv);
    setResult(parsed);
    if (parsed.questions.length === 0 && parsed.errors.length === 0) {
      setError("No questions were found in that sheet.");
    }
  }

  async function loadFromLink() {
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/import-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sheetUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't load the sheet.");
      } else {
        loadCsv(data.csv as string);
      }
    } catch {
      setError("Couldn't load the sheet. Try again or upload a CSV.");
    }
    setLoading(false);
  }

  async function loadFromFile(file: File) {
    setError("");
    setResult(null);
    try {
      loadCsv(await file.text());
    } catch {
      setError("Couldn't read that file.");
    }
  }

  function downloadTemplate() {
    // Pre-fill the Lesson column with this lesson's admin URL so imports can
    // be matched back to the lesson.
    const lessonUrl = `${window.location.origin}${window.location.pathname}`;
    const blob = new Blob(["\uFEFF" + buildImportTemplate(lessonUrl)], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "question-import-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const all = result?.questions ?? [];
  const matched = all.filter((q) => lessonRefMatches(q.lessonRef, lessonId));
  const canFilter = matched.length > 0 && matched.length < all.length;
  const selected = canFilter && onlyThisLesson ? matched : all;

  async function runImport() {
    if (selected.length === 0) return;
    setImporting(true);
    setError("");
    try {
      await onImport(selected, { gate });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setImporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        <FileSpreadsheet size={17} />
        Import questions
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900">
                Import questions
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {hint && <p className="text-sm text-slate-500">{hint}</p>}

              {/* Step 1: template */}
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    1. Download the template
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Fill it in using the same columns, then upload it below or
                    paste a Google Sheets link. Open the file for instructions
                    and an example of every question type.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Download size={15} />
                  Download template
                </button>
              </div>

              <p className="-mb-2 text-sm font-semibold text-slate-800">
                2. Load your completed sheet
              </p>

              {/* Source */}
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-500">
                    Google Sheets link{" "}
                    <span className="text-slate-400">
                      (shared as &ldquo;Anyone with the link can view&rdquo;)
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-pd-red"
                    />
                    <button
                      type="button"
                      onClick={loadFromLink}
                      disabled={!sheetUrl.trim() || loading}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {loading && <Loader2 size={15} className="animate-spin" />}
                      Load
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-slate-400">or</span>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
                    <Upload size={15} />
                    Upload a CSV file
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) loadFromFile(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Preview */}
              {result && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 size={16} className="text-green-600" />
                    <span className="font-medium text-slate-800">
                      {all.length} valid question{all.length !== 1 ? "s" : ""}{" "}
                      found
                    </span>
                    {result.errors.length > 0 && (
                      <span className="text-red-600">
                        &middot; {result.errors.length} row
                        {result.errors.length !== 1 ? "s" : ""} skipped
                      </span>
                    )}
                  </div>

                  {canFilter && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={onlyThisLesson}
                        onChange={(e) => setOnlyThisLesson(e.target.checked)}
                      />
                      Only import rows tagged for this lesson ({matched.length}{" "}
                      of {all.length})
                    </label>
                  )}
                  {!canFilter && matched.length === 0 && all.length > 0 && (
                    <p className="text-xs text-slate-400">
                      No rows are tagged for this lesson, so all {all.length}{" "}
                      will be imported.
                    </p>
                  )}

                  {showGate && (
                    <div className="flex items-center gap-2 text-sm">
                      <label className="text-slate-600">To continue:</label>
                      <select
                        value={gate}
                        onChange={(e) =>
                          setGate(e.target.value as QuestionGate)
                        }
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-pd-red"
                      >
                        <option value="answered">Must be answered</option>
                        <option value="correct">Must be answered correctly</option>
                        <option value="none">Optional</option>
                      </select>
                    </div>
                  )}

                  {selected.length > 0 && (
                    <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                      {selected.map((q) => (
                        <div key={q.row} className="px-3 py-2 text-sm">
                          <p className="truncate font-medium text-slate-800">
                            {q.text}
                          </p>
                          <p className="text-xs text-slate-400">
                            Row {q.row} &middot; {TYPE_LABEL[q.type]}
                            {q.type !== "short_answer" &&
                              ` · ${q.options.length} options`}
                            {q.media_type && ` · ${q.media_type}`}
                            {q.warnings.length > 0 &&
                              ` · ${q.warnings.join(" ")}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.errors.length > 0 && (
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-xl bg-red-50 p-3 text-xs text-red-700">
                      {result.errors.map((e, i) => (
                        <p key={i}>
                          {e.row > 0 ? `Row ${e.row}: ` : ""}
                          {e.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 p-5">
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runImport}
                disabled={selected.length === 0 || importing}
                className="inline-flex items-center gap-2 rounded-xl bg-pd-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pd-red-hover disabled:opacity-50"
              >
                {importing && <Loader2 size={16} className="animate-spin" />}
                {importing
                  ? "Importing..."
                  : `Import ${selected.length || ""} question${
                      selected.length === 1 ? "" : "s"
                    }`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
