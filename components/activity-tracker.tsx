"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { BREAK_MS, HEARTBEAT_MS, courseIdFromPath } from "@/lib/activity";

// Records learner activity as continuous "stretches":
//  - any click / key / scroll / touch / mouse movement, or a playing video,
//    counts as activity;
//  - 5 minutes with no activity ends the stretch (the gap is a break) and the
//    next interaction starts a new one;
//  - moving into a different course also starts a new stretch, so time per
//    course is exact.
// The open stretch is reported every 30s (and when the tab is hidden/closed);
// the same call refreshes the learner's online presence.

const EVENTS = ["mousedown", "keydown", "scroll", "wheel", "touchstart", "mousemove"] as const;

type Seg = { id: string; start: number; last: number; courseId: string | null; path: string };

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function ActivityTracker() {
  const pathname = usePathname();
  const seg = useRef<Seg | null>(null);
  const dirty = useRef(false);
  const lastMark = useRef(0);
  const course = useRef<string | null>(courseIdFromPath(pathname));
  const path = useRef(pathname);
  const playing = useRef(new Set<unknown>());

  function payload(s: Seg | null, closing = false) {
    return JSON.stringify({
      closing,
      path: path.current,
      course_id: course.current,
      segment: s
        ? {
            id: s.id,
            started_at: new Date(s.start).toISOString(),
            ended_at: new Date(s.last).toISOString(),
            course_id: s.courseId,
            path: s.path,
          }
        : null,
    });
  }

  function send(s: Seg | null, opts: { beacon?: boolean; closing?: boolean } = {}) {
    const body = payload(s, opts.closing);
    if (opts.beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/activity", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  /** Close the current stretch (report it) and forget it. */
  function finish(beacon = false) {
    if (seg.current) send(seg.current, { beacon });
    seg.current = null;
    dirty.current = false;
  }

  function markActive() {
    const now = Date.now();
    // mousemove fires constantly; one mark per second is plenty.
    if (now - lastMark.current < 1000) return;
    lastMark.current = now;

    const s = seg.current;
    if (s && now - s.last <= BREAK_MS && s.courseId === course.current) {
      s.last = now;
      dirty.current = true;
      return;
    }
    // Break (or course change): report the old stretch, start a new one.
    if (s) finish();
    seg.current = { id: uuid(), start: now, last: now, courseId: course.current, path: path.current };
    dirty.current = true;
    send(seg.current); // report the start straight away so "Active now" is instant
    dirty.current = false;
  }

  // Course / page changes
  useEffect(() => {
    const next = courseIdFromPath(pathname);
    path.current = pathname;
    if (next !== course.current) {
      course.current = next;
      if (seg.current) {
        // End the old course's stretch now and continue in the new context.
        seg.current.last = Math.max(seg.current.last, Date.now());
        finish();
      }
      lastMark.current = 0;
      markActive(); // navigating is an interaction
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onPlay = (e: Event) => playing.current.add(e.target);
    const onStop = (e: Event) => playing.current.delete(e.target);
    const onMedia = (e: Event) => {
      const { id, playing: isPlaying } = (e as CustomEvent).detail ?? {};
      if (isPlaying) playing.current.add(id);
      else playing.current.delete(id);
    };
    for (const n of EVENTS) window.addEventListener(n, markActive, { passive: true });
    document.addEventListener("play", onPlay, true);
    document.addEventListener("pause", onStop, true);
    document.addEventListener("ended", onStop, true);
    window.addEventListener("lms-media", onMedia);

    // A playing video keeps the learner active without clicks.
    const mediaTimer = setInterval(() => {
      if (playing.current.size > 0) {
        lastMark.current = 0;
        markActive();
      }
    }, 15_000);

    // Heartbeat: report the open stretch and refresh presence.
    const beat = setInterval(() => {
      const s = seg.current;
      if (s && Date.now() - s.last > BREAK_MS) {
        // Went quiet: the stretch ended at its last activity.
        finish();
        send(null);
        return;
      }
      send(s);
      dirty.current = false;
    }, HEARTBEAT_MS);

    const onHide = () => {
      if (document.visibilityState === "hidden") {
        if (seg.current) send(seg.current, { beacon: true });
      }
    };
    const onLeave = () => {
      send(seg.current, { beacon: true, closing: true });
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);

    // Opening the LMS counts as the first interaction.
    markActive();

    return () => {
      clearInterval(mediaTimer);
      clearInterval(beat);
      for (const n of EVENTS) window.removeEventListener(n, markActive);
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("pause", onStop, true);
      document.removeEventListener("ended", onStop, true);
      window.removeEventListener("lms-media", onMedia);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
