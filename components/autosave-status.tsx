"use client";
import type { AutosaveStatusValue } from "@/lib/use-autosave";

type Props = {
  status: AutosaveStatusValue;
  errorMessage?: string;
  onRetry: () => void;
  /** Amber notice, e.g. the course was set back to draft. */
  notice?: string;
};

export function AutosaveStatus({ status, errorMessage, onRetry, notice }: Props) {
  return (
    <div className="flex flex-col items-end gap-1">
      {status === "unsaved" && (
        <span className="text-sm text-slate-500" title={errorMessage || undefined}>
          Unsaved changes
          {errorMessage ? ` (${errorMessage})` : ""}
        </span>
      )}
      {status === "saving" && (
        <span className="text-sm text-slate-500">Saving...</span>
      )}
      {status === "saved" && <span className="text-sm text-slate-500">Saved</span>}
      {status === "error" && (
        <span className="text-sm text-red-600" title={errorMessage || undefined}>
          Couldn&apos;t save.{" "}
          <button type="button" onClick={onRetry} className="font-medium underline">
            Retry
          </button>
          {errorMessage ? ` (${errorMessage})` : ""}
        </span>
      )}
      {notice && (
        <span className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </span>
      )}
    </div>
  );
}
