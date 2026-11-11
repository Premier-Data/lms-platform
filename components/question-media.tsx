"use client";

import { parseYouTubeId } from "@/lib/coding-drill";
import { RestrictedVideo } from "@/components/restricted-video";

/**
 * Question media: image, uploaded video file, or a YouTube link.
 * Learner videos can't be skipped through (`restrictVideo`, on by default);
 * the admin preview turns this off so authors can scrub freely.
 */
export function QuestionMedia({
  url,
  type,
  restrictVideo = true,
}: {
  url: string;
  type: string | null;
  restrictVideo?: boolean;
}) {
  if (type === "video") {
    if (restrictVideo) {
      // Doesn't block answering the question, just prevents skipping ahead.
      return <RestrictedVideo url={url} />;
    }

    const ytId = parseYouTubeId(url);
    if (ytId) {
      return (
        <div className="aspect-video w-full">
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            title="Question video"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      );
    }
    return <video src={url} controls className="w-full" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="w-full object-cover" />
  );
}
