"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { parseYouTubeId, parseYouTubeStart } from "@/lib/coding-drill";

export type DrillVideoHandle = {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
  play: () => void;
};

type Props = {
  url: string;
  className?: string;
  onError?: () => void;
};

// Loads the YouTube IFrame API once and resolves when ready.
let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // Already loaded.
  if ((window as unknown as { YT?: { Player?: unknown } }).YT?.Player) {
    return Promise.resolve();
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    // The API calls this global when ready.
    (
      window as unknown as { onYouTubeIframeAPIReady?: () => void }
    ).onYouTubeIframeAPIReady = () => resolve();
  });
  return ytApiPromise;
}

/**
 * Unified drill video player. Uses the YouTube IFrame API for YouTube URLs
 * (so current time + seek work) and a native <video> for direct file URLs.
 * Exposes an imperative handle so the editor/learner can read currentTime and
 * seek regardless of source.
 */
export const DrillVideo = forwardRef<DrillVideoHandle, Props>(
  function DrillVideo({ url, className, onError }, ref) {
    const ytId = parseYouTubeId(url);
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);

    useImperativeHandle(
      ref,
      () => ({
        getCurrentTime() {
          if (ytId && playerRef.current?.getCurrentTime) {
            return playerRef.current.getCurrentTime() ?? 0;
          }
          return videoRef.current?.currentTime ?? 0;
        },
        seekTo(seconds: number) {
          if (ytId && playerRef.current?.seekTo) {
            playerRef.current.seekTo(seconds, true);
            playerRef.current.playVideo?.();
          } else if (videoRef.current) {
            videoRef.current.currentTime = seconds;
            videoRef.current.play().catch(() => {});
          }
        },
        play() {
          if (ytId && playerRef.current?.playVideo) {
            playerRef.current.playVideo();
          } else {
            videoRef.current?.play().catch(() => {});
          }
        },
      }),
      [ytId]
    );

    // Initialise the YouTube player when the URL is a YouTube link.
    useEffect(() => {
      if (!ytId) return;
      let cancelled = false;
      const start = parseYouTubeStart(url);

      loadYouTubeApi().then(() => {
        if (cancelled || !containerRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const YT = (window as any).YT;
        if (!YT?.Player) return;
        // Clear any previous player node.
        containerRef.current.innerHTML = "";
        const host = document.createElement("div");
        containerRef.current.appendChild(host);
        playerRef.current = new YT.Player(host, {
          videoId: ytId,
          playerVars: {
            start: start || 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onError: () => onError?.(),
          },
        });
      });

      return () => {
        cancelled = true;
        try {
          playerRef.current?.destroy?.();
        } catch {
          // ignore
        }
        playerRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ytId, url]);

    if (ytId) {
      return (
        <div
          ref={containerRef}
          className={`h-full w-full [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full ${
            className ?? ""
          }`}
        />
      );
    }

    // Direct file URL — native video.
    return (
      <video
        ref={videoRef}
        src={url}
        controls
        className={`h-full w-full object-contain ${className ?? ""}`}
        onError={() => onError?.()}
      />
    );
  }
);
