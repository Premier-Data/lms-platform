import { useEffect, useRef } from "react";

// A learner counts as "active" while the tab is visible and they have either
// interacted recently or a video is playing. A tab left open overnight, or a
// learner who walks away, stops accumulating time after IDLE_MS.
const IDLE_MS = 90_000;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
] as const;

/**
 * Calls `onActiveSecond` once for every second of genuinely active time.
 *
 * Video playing counts as active even without clicks. Native <video> elements
 * are detected via capture-phase play/pause events; YouTube players announce
 * themselves with a window "lms-media" CustomEvent ({ id, playing }).
 */
export function useActiveTime(enabled: boolean, onActiveSecond: () => void) {
  const callback = useRef(onActiveSecond);
  useEffect(() => {
    callback.current = onActiveSecond;
  });

  useEffect(() => {
    if (!enabled) return;

    let lastActivity = Date.now();
    const playing = new Set<unknown>();

    const markActive = () => {
      lastActivity = Date.now();
    };
    const onPlay = (e: Event) => playing.add(e.target);
    const onStop = (e: Event) => playing.delete(e.target);
    const onMedia = (e: Event) => {
      const { id, playing: isPlaying } = (e as CustomEvent).detail ?? {};
      if (isPlaying) playing.add(id);
      else playing.delete(id);
    };

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, markActive, { passive: true });
    }
    // Media events don't bubble, so listen in the capture phase.
    document.addEventListener("play", onPlay, true);
    document.addEventListener("pause", onStop, true);
    document.addEventListener("ended", onStop, true);
    window.addEventListener("lms-media", onMedia);

    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const recentlyActive = Date.now() - lastActivity < IDLE_MS;
      if (recentlyActive || playing.size > 0) callback.current();
    }, 1000);

    return () => {
      clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, markActive);
      }
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("pause", onStop, true);
      document.removeEventListener("ended", onStop, true);
      window.removeEventListener("lms-media", onMedia);
    };
  }, [enabled]);
}
