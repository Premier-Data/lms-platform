"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatusValue = "idle" | "unsaved" | "saving" | "saved" | "error";

type Options<T> = {
  data: T;
  /** Persist the data. Throw an Error with a readable message on failure. */
  save: (data: T) => Promise<void>;
  enabled?: boolean;
  delayMs?: number;
  /** Return a reason string to skip saving (nothing is sent). */
  canSave?: (data: T) => string | null;
};

export function useAutosave<T>({
  data,
  save,
  enabled = true,
  delayMs = 2000,
  canSave,
}: Options<T>) {
  const [status, setStatus] = useState<AutosaveStatusValue>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const json = JSON.stringify(data);
  const dataRef = useRef(data);
  const jsonRef = useRef(json);
  const saveRef = useRef(save);
  const canSaveRef = useRef(canSave);
  const enabledRef = useRef(enabled);
  const lastSaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const discarded = useRef(false);

  useEffect(() => {
    dataRef.current = data;
    jsonRef.current = json;
    saveRef.current = save;
    canSaveRef.current = canSave;
    enabledRef.current = enabled;
  });

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const isDirty = () =>
    enabledRef.current &&
    lastSaved.current !== null &&
    jsonRef.current !== lastSaved.current;

  const run = useCallback((): Promise<boolean> => {
    if (inflight.current) {
      pending.current = true;
      return inflight.current;
    }
    clearTimer();
    const p = (async () => {
      let ok = true;
      try {
        do {
          pending.current = false;
          if (!isDirty()) break;
          const snapshot = dataRef.current;
          const snapshotJson = jsonRef.current;
          const reason = canSaveRef.current?.(snapshot) ?? null;
          if (reason) {
            if (mounted.current) {
              setErrorMessage(reason);
              setStatus("unsaved");
            }
            ok = false;
            break;
          }
          if (mounted.current) {
            setErrorMessage("");
            setStatus("saving");
          }
          try {
            await saveRef.current(snapshot);
            lastSaved.current = snapshotJson;
          } catch (e) {
            ok = false;
            if (mounted.current) {
              setErrorMessage(e instanceof Error ? e.message : "Save failed");
              setStatus("error");
            }
            break;
          }
        } while (pending.current || isDirty());
        if (ok && mounted.current) {
          setStatus(isDirty() ? "unsaved" : "saved");
        }
      } finally {
        inflight.current = null;
      }
      return ok;
    })();
    inflight.current = p;
    return p;
  }, []);

  // Capture the baseline when enabled; drop it when disabled.
  useEffect(() => {
    if (enabled) {
      if (lastSaved.current === null) lastSaved.current = jsonRef.current;
    } else {
      lastSaved.current = null;
      clearTimer();
    }
  }, [enabled]);

  // Debounce on every change.
  useEffect(() => {
    if (!enabled || lastSaved.current === null) return;
    if (json !== lastSaved.current) {
      if (!inflight.current) setStatus("unsaved");
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        void run();
      }, delayMs);
    } else if (!inflight.current) {
      clearTimer();
      setStatus((s) => (s === "unsaved" || s === "error" ? "saved" : s));
    }
  }, [json, enabled, delayMs, run]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    if (status !== "unsaved" && status !== "saving" && status !== "error") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  // Flush once on unmount.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      if (!discarded.current && isDirty()) void run();
    };
  }, [run]);

  const flush = useCallback(() => run(), [run]);

  const discard = useCallback(() => {
    discarded.current = true;
    clearTimer();
    lastSaved.current = jsonRef.current;
    setStatus("idle");
  }, []);

  return {
    status: enabled ? status : ("idle" as AutosaveStatusValue),
    errorMessage,
    flush,
    discard,
    dirty: status === "unsaved" || status === "error",
  };
}
