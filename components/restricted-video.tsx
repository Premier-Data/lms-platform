"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { parseYouTubeId } from "@/lib/coding-drill";
import { loadYouTubeApi } from "@/components/drill-video";

type Props = {
  url: string;
  /** called once when the video plays through to the end */
  onEnded?: () => void;
  /**
   * When false the video is a normal, freely seekable player (e.g. admin
   * preview, or a learner who has already watched it all the way through).
   * Defaults to true.
   */
  restricted?: boolean;
  className?: string;
};

// How far past the furthest watched point playback may drift before we treat
// it as a skip (covers normal playback and buffering jitter).
const SKIP_TOLERANCE = 1.5;

/**
 * Learner video player that stops viewers skipping ahead: any attempt to jump
 * past the furthest point they have actually played is reverted, playback
 * speed is locked to 1x, and `onEnded` fires only when the video finishes.
 * Rewinding is allowed. Works for direct files and YouTube links.
 *
 * Note: this is enforced in the browser, so it deters casual skipping but
 * can't stop a determined user tampering with their own browser.
 */
export function RestrictedVideo({
  url,
  onEnded,
  restricted = true,
  className,
}: Props) {
  const ytId = parseYouTubeId(url);
  const [finished, setFinished] = useState(false);

  // Keep the latest callback without re-running the player effects.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  const handleEnded = useCallback(() => {
    setFinished(true);
    onEndedRef.current?.();
  }, []);

  return (
    <div className={className}>
      <div className="aspect-video overflow-hidden rounded-xl bg-slate-900">
        {ytId ? (
          <YouTubeRestricted
            ytId={ytId}
            restricted={restricted}
            onEnded={handleEnded}
          />
        ) : (
          <NativeRestricted
            url={url}
            restricted={restricted}
            onEnded={handleEnded}
          />
        )}
      </div>

      {restricted && (
        <p
          className={`mt-2 flex items-center gap-1.5 text-xs ${
            finished ? "text-green-600" : "text-slate-500"
          }`}
        >
          {finished ? (
            <>
              <CheckCircle2 size={13} />
              Video watched.
            </>
          ) : (
            <>
              <Lock size={13} />
              Watch the whole video to continue. Skipping ahead is disabled.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function NativeRestricted({
  url,
  restricted,
  onEnded,
}: {
  url: string;
  restricted: boolean;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Furthest point legitimately reached (seconds).
  const maxRef = useRef(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => {
      if (!restricted) return;
      if (!v.seeking && v.currentTime - maxRef.current <= SKIP_TOLERANCE) {
        maxRef.current = Math.max(maxRef.current, v.currentTime);
      }
    };
    const onSeeking = () => {
      if (restricted && v.currentTime > maxRef.current + 0.25) {
        v.currentTime = maxRef.current;
      }
    };
    const onRate = () => {
      if (restricted && v.playbackRate !== 1) v.playbackRate = 1;
    };
    const ended = () => onEnded();

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("ratechange", onRate);
    v.addEventListener("ended", ended);
    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("ratechange", onRate);
      v.removeEventListener("ended", ended);
    };
  }, [restricted, onEnded]);

  return (
    <video
      ref={videoRef}
      src={url}
      controls
      controlsList={restricted ? "nodownload noplaybackrate" : undefined}
      disablePictureInPicture={restricted}
      onContextMenu={restricted ? (e) => e.preventDefault() : undefined}
      className="h-full w-full object-contain"
    />
  );
}

function YouTubeRestricted({
  ytId,
  restricted,
  onEnded,
}: {
  ytId: string;
  restricted: boolean;
  onEnded: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const restrictedRef = useRef(restricted);
  useEffect(() => {
    restrictedRef.current = restricted;
  }, [restricted]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null;
    let max = 0;

    loadYouTubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      if (!YT?.Player) return;

      containerRef.current.innerHTML = "";
      const host = document.createElement("div");
      containerRef.current.appendChild(host);

      player = new YT.Player(host, {
        videoId: ytId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          disablekb: 1, // no keyboard seeking
        },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === 0) onEnded(); // ENDED
          },
        },
      });

      // YouTube has no "seeking" event, so poll the playhead and pull the
      // viewer back if they jump ahead or change the speed.
      timer = setInterval(() => {
        if (!player?.getCurrentTime || !restrictedRef.current) return;
        const t = player.getCurrentTime() as number;
        if (t - max > SKIP_TOLERANCE) {
          player.seekTo(max, true);
        } else if (t > max) {
          max = t;
        }
        if (player.getPlaybackRate?.() !== 1) player.setPlaybackRate?.(1);
      }, 500);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try {
        player?.destroy?.();
      } catch {
        // ignore
      }
    };
  }, [ytId, onEnded]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full"
    />
  );
}
