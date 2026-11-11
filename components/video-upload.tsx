"use client";

import { useRef, useState } from "react";
import {
  Video,
  Upload,
  Trash2,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { parseYouTubeId } from "@/lib/coding-drill";

type VideoUploadProps = {
  value: string;
  onChange: (url: string) => void;
  /** Hide the built-in native-video preview (e.g. when the caller renders its
   *  own player that supports YouTube). */
  hidePreview?: boolean;
};

export function VideoUpload({
  value,
  onChange,
  hidePreview = false,
}: VideoUploadProps) {
  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) return;

    setError("");

    if (
      !file.type.startsWith(
        "video/"
      )
    ) {
      setError(
        "Please select a valid video file."
      );

      return;
    }

    // 2 GB limit
    if (
      file.size >
      2 * 1024 * 1024 * 1024
    ) {
      setError(
        "Video must be smaller than 2 GB."
      );

      return;
    }

    setIsUploading(true);

    try {
      // Step 1: Get a presigned upload URL from the server
      const presignRes = await fetch("/api/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
        }),
      });

      const presignData = await presignRes.json();

      if (!presignRes.ok) {
        throw new Error(presignData.error || "Could not get upload URL.");
      }

      // Step 2: Upload the file directly to R2 via the presigned URL
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Upload to storage failed.");
      }

      // Step 3: Record the file for storage tracking
      await fetch("/api/admin/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_name: file.name,
          file_url: presignData.publicUrl,
          r2_key: presignData.key,
          file_type: "video",
          size_bytes: file.size,
        }),
      });

      // Step 4: Use the public URL
      onChange(presignData.publicUrl);
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload video.";

      setError(message);
    } finally {
      setIsUploading(false);

      if (
        fileInputRef.current
      ) {
        fileInputRef.current.value =
          "";
      }
    }
  }

  function handleRemove() {
    onChange("");
    setError("");
  }

  return (
    <div className="space-y-4">

      {/* Video URL */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
          <LinkIcon size={16} />
          Video URL{" "}
          <span className="font-normal text-slate-400">
            (YouTube link or direct .mp4)
          </span>
        </label>

        <input
          value={value}
          onChange={(event) => {
            onChange(
              event.target.value
            );

            setError("");
          }}
          placeholder="Paste a YouTube link or direct video URL..."
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-slate-900"
        />
      </div>

      {/* Divider */}
      <div className="relative flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200" />

        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          or
        </span>

        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {/* Upload */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() =>
            fileInputRef.current?.click()
          }
          disabled={isUploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm font-medium text-slate-600 transition hover:border-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2
                size={20}
                className="animate-spin"
              />

              Uploading video...
            </>
          ) : (
            <>
              <Upload size={20} />

              Upload video from computer
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Preview */}
      {value && !hidePreview && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">

          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">

            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Video size={17} />

              Video Preview
            </span>

            <button
              type="button"
              onClick={handleRemove}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <Trash2 size={16} />

              Remove
            </button>

          </div>

          <div className="bg-slate-50 p-4">

            {parseYouTubeId(value) ? (
              <iframe
                src={`https://www.youtube.com/embed/${parseYouTubeId(value)}`}
                title="Video preview"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="aspect-video w-full rounded-lg bg-black"
              />
            ) : (
              <video
                src={value}
                controls
                className="aspect-video w-full rounded-lg bg-black"
                onError={() =>
                  setError(
                    "The video could not be loaded."
                  )
                }
              />
            )}

          </div>

        </div>
      )}

    </div>
  );
}