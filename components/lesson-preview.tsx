"use client";

import { useState } from "react";
import {
  Monitor,
  Smartphone,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type LessonBlock = {
  id: string;
  page_id: string | null;
  block_type: string;
  content: string | null;
  position: number;
};

type LessonPage = {
  id: string;
  title: string;
  position: number;
};

type LessonPreviewProps = {
  lessonTitle: string;
  pages: LessonPage[];
  blocks: LessonBlock[];
  activePageId?: string;
  onNavigate?: (pageId: string) => void;
};

export function LessonPreview({
  lessonTitle,
  pages,
  blocks,
  activePageId,
  onNavigate,
}: LessonPreviewProps) {
  const [view, setView] = useState<
    "desktop" | "mobile"
  >("desktop");

  const [activePage, setActivePage] =
    useState(0);

  // Find the page currently selected
  // in the lesson builder
  const externalPageIndex = activePageId
    ? pages.findIndex(
      (page) => page.id === activePageId
    )
    : -1;

  // Use the builder-selected page when available.
  // Otherwise use the preview's own navigation.
  const currentPageIndex =
    externalPageIndex >= 0
      ? externalPageIndex
      : activePage;

  const currentPage =
    pages[currentPageIndex];

  const pageBlocks = currentPage
    ? blocks
      .filter(
        (block) =>
          block.page_id === currentPage.id
      )
      .sort(
        (a, b) =>
          a.position - b.position
      )
    : [];

  function goToPage(index: number) {
    if (
      index < 0 ||
      index >= pages.length
    ) {
      return;
    }

    setActivePage(index);

    // Sync the builder's selected page so navigating in the preview also
    // moves the admin to that page/lesson in the editor.
    const targetPage = pages[index];
    if (targetPage && onNavigate) {
      onNavigate(targetPage.id);
    }
  }

  return (
  <div className="sticky top-6 h-[calc(100vh-48px)]">
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* Preview header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Live Preview
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              See what your learners will see
            </p>
          </div>

          <div className="flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() =>
                setView("desktop")
              }
              className={`flex h-8 w-9 items-center justify-center rounded-md transition ${view === "desktop"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
                }`}
              title="Desktop preview"
            >
              <Monitor size={17} />
            </button>

            <button
              type="button"
              onClick={() =>
                setView("mobile")
              }
              className={`flex h-8 w-9 items-center justify-center rounded-md transition ${view === "mobile"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
                }`}
              title="Mobile preview"
            >
              <Smartphone size={17} />
            </button>
          </div>
        </div>

{/* Preview background */}
<div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-6">
          <div
            className={`mx-auto overflow-hidden bg-white shadow-lg transition-all ${view === "mobile"
                ? "w-[375px] rounded-[2rem] border-[8px] border-slate-900"
                : "w-full rounded-xl"
              }`}
          >
            {/* Learner header */}
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="text-xs font-medium text-slate-400">
                TRAINING
              </div>

              <h1 className="mt-1 text-xl font-bold text-slate-900">
                {lessonTitle ||
                  "Untitled Lesson"}
              </h1>
            </div>

            {/* Page content */}
            <div
              className={`${view === "mobile"
                  ? "px-5 py-6"
                  : "px-8 py-8"
                }`}
            >
              {currentPage ? (
                <>
                  <h2
                    className={`mb-6 font-bold text-slate-900 ${view === "mobile"
                        ? "text-xl"
                        : "text-2xl"
                      }`}
                  >
                    {currentPage.title ||
                      `Page ${currentPageIndex + 1
                      }`}
                  </h2>

                  <div className="space-y-6">
                    {pageBlocks.map(
                      (block) => (
                        <PreviewBlock
                          key={block.id}
                          block={block}
                        />
                      )
                    )}

                    {pageBlocks.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-400">
                        Add content to see it here
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[400px] items-center justify-center text-center">
                  <div>
                    <h3 className="font-semibold text-slate-700">
                      No pages yet
                    </h3>

                    <p className="mt-2 text-sm text-slate-400">
                      Add a page to start building
                      your lesson.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            {pages.length > 0 && (
              <div className="border-t border-slate-200 px-5 py-4">
                {/* Page dots */}
                <div className="mb-4 flex items-center justify-center gap-2">
                  {pages.map(
                    (page, index) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() =>
                          goToPage(index)
                        }
                        className={`h-2 rounded-full transition-all ${currentPageIndex ===
                            index
                            ? "w-6 bg-slate-900"
                            : "w-2 bg-slate-300"
                          }`}
                        title={`Go to page ${index + 1
                          }`}
                      />
                    )
                  )}
                </div>

                {/* Previous / Next */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    disabled={
                      currentPageIndex === 0
                    }
                    onClick={() =>
                      goToPage(
                        currentPageIndex - 1
                      )
                    }
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 disabled:opacity-30"
                  >
                    <ChevronLeft size={17} />
                    Previous
                  </button>

                  <span className="text-xs text-slate-400">
                    {currentPageIndex + 1} of{" "}
                    {pages.length}
                  </span>

                  <button
                    type="button"
                    disabled={
                      currentPageIndex ===
                      pages.length - 1
                    }
                    onClick={() =>
                      goToPage(
                        currentPageIndex + 1
                      )
                    }
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 disabled:opacity-30"
                  >
                    Next
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBlock({
  block,
}: {
  block: LessonBlock;
}) {
  if (block.block_type === "heading") {
    return (
      <h3 className="text-xl font-bold text-slate-900">
        {block.content}
      </h3>
    );
  }

  if (block.block_type === "text") {
    return (
      <div
        className="
          text-sm
          leading-6
          text-slate-700

          [&_p]:mb-4

          [&_ul]:my-4
          [&_ul]:list-disc
          [&_ul]:pl-6

          [&_ol]:my-4
          [&_ol]:list-decimal
          [&_ol]:pl-6

          [&_li]:mb-2
          [&_li]:pl-1

          [&_h1]:mb-4
          [&_h1]:text-3xl
          [&_h1]:font-bold
          [&_h1]:text-slate-900

          [&_h2]:mb-3
          [&_h2]:text-2xl
          [&_h2]:font-bold
          [&_h2]:text-slate-900

          [&_h3]:mb-2
          [&_h3]:text-xl
          [&_h3]:font-semibold
          [&_h3]:text-slate-900

          [&_strong]:font-bold
          [&_em]:italic
          [&_u]:underline

          [&_a]:text-blue-600
          [&_a]:underline

          [&_blockquote]:my-4
          [&_blockquote]:border-l-4
          [&_blockquote]:border-slate-300
          [&_blockquote]:pl-4
          [&_blockquote]:italic
        "
        dangerouslySetInnerHTML={{
          __html: block.content || "",
        }}
      />
    );
  }

  if (block.block_type === "image") {
    if (!block.content) return null;

    return (
      <img
        src={block.content}
        alt=""
        className="h-auto w-full rounded-xl"
      />
    );
  }

  if (block.block_type === "video") {
    if (!block.content) return null;

    return (
      <div className="aspect-video overflow-hidden rounded-xl bg-slate-900">
        <video
          src={block.content}
          controls
          className="h-full w-full"
        />
      </div>
    );
  }

  if (block.block_type === "coding_drill") {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
        <p className="font-medium text-slate-700">Coding Drill</p>
        <p className="mt-1 text-xs">
          Learners watch the video and click stats to build a timeline, graded
          against your master. Interactive in the live lesson.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-100 p-4 text-sm text-slate-500">
      {block.content || "Empty block"}
    </div>
  );
}