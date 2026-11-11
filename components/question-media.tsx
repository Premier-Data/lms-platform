"use client";

import { parseYouTubeId } from "@/lib/coding-drill";

/** Question media: image, uploaded video file, or a YouTube link. */
export function QuestionMedia({
  url,
  type,
}: {
  url: string;
  type: string | null;
}) {
  if (type === "video") {
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
