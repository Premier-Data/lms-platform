"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Trash2,
  Plus,
  Type,
  AlignLeft,
  Image as ImageIcon,
  Video,
  X,
  FileText,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Film,
} from "lucide-react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { createClient } from "@/lib/supabase/client";
import { ImageUpload } from "@/components/image-upload";
import { LessonPreview } from "@/components/lesson-preview";
import { VideoUpload } from "@/components/video-upload";
import { CodingDrillEditor } from "@/components/coding-drill-editor";

type Lesson = {
  id: string;
  title: string;
  lesson_type: string;
  content: string | null;
  video_url: string | null;
  image_url: string | null;
};

type LessonPage = {
  id: string;
  lesson_id: string;
  title: string;
  position: number;
};

type LessonBlock = {
  id: string;
  page_id: string | null;
  block_type: string;
  content: string;
  position: number;
};

type LessonEditorFormProps = {
  lesson: Lesson;
  initialPages: LessonPage[];
  initialBlocks: LessonBlock[];
  courseId: string;
};

type NewBlockType = "heading" | "text" | "image" | "video" | "coding_drill";

export function LessonEditorForm({
  lesson,
  initialPages,
  initialBlocks,
  courseId,
}: LessonEditorFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(lesson.title);

  const [pages, setPages] = useState<LessonPage[]>(
    initialPages
  );

  const [blocks, setBlocks] = useState<LessonBlock[]>(
    initialBlocks
  );

  const [selectedPageId, setSelectedPageId] =
    useState<string | null>(
      initialPages.length > 0
        ? initialPages[0].id
        : null
    );

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");

  // Drag-to-reorder pages
  const [dragPageId, setDragPageId] = useState<string | null>(null);

  function reorderPages(fromId: string, toId: string) {
    if (fromId === toId) return;
    setPages((current) => {
      const list = [...current];
      const from = list.findIndex((p) => p.id === fromId);
      const to = list.findIndex((p) => p.id === toId);
      if (from === -1 || to === -1) return current;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return list.map((p, i) => ({ ...p, position: i }));
    });
  }

  function addPage() {
    const newPage: LessonPage = {
      id: crypto.randomUUID(),
      lesson_id: lesson.id,
      title: `Page ${pages.length + 1}`,
      position: pages.length,
    };

    setPages((current) => [...current, newPage]);
    setSelectedPageId(newPage.id);
  }

  function updatePageTitle(
    id: string,
    value: string
  ) {
    setPages((current) =>
      current.map((page) =>
        page.id === id
          ? { ...page, title: value }
          : page
      )
    );
  }

  function removePage(id: string) {
    if (pages.length <= 1) {
      setMessage(
        "A lesson must have at least one page."
      );
      return;
    }

    setPages((current) =>
      current
        .filter((page) => page.id !== id)
        .map((page, index) => ({
          ...page,
          position: index,
        }))
    );

    setBlocks((current) =>
      current.filter((block) => block.page_id !== id)
    );

    if (selectedPageId === id) {
      const remainingPages = pages.filter(
        (page) => page.id !== id
      );

      setSelectedPageId(
        remainingPages[0]?.id || null
      );
    }
  }

  function addBlock(type: NewBlockType) {
    if (!selectedPageId) {
      setMessage(
        "Please add and select a page first."
      );
      return;
    }

    const pageBlocks = blocks.filter(
      (block) =>
        block.page_id === selectedPageId
    );

    const newBlock = {
      id: crypto.randomUUID(),
      page_id: selectedPageId,
      block_type: type,
      content: "",
      position: blocks.length,
    };

    setBlocks((current) => [
      ...current,
      newBlock,
    ]);
  }

  function updateBlock(
    id: string,
    content: string
  ) {
    setBlocks((current) =>
      current.map((block) =>
        block.id === id
          ? { ...block, content }
          : block
      )
    );
  }

  function moveBlock(
    blockId: string,
    direction: "up" | "down"
  ) {
    const block = blocks.find(
      (item) => item.id === blockId
    );

    if (!block) return;

    const pageBlocks = blocks
      .filter(
        (block) =>
          block.page_id === selectedPageId
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

    const currentIndex =
      pageBlocks.findIndex(
        (item) => item.id === blockId
      );

    if (currentIndex === -1) return;

    const newIndex =
      direction === "up"
        ? currentIndex - 1
        : currentIndex + 1;

    if (
      newIndex < 0 ||
      newIndex >= pageBlocks.length
    ) {
      return;
    }

    const reorderedPageBlocks = [
      ...pageBlocks,
    ];

    const [movedBlock] =
      reorderedPageBlocks.splice(
        currentIndex,
        1
      );

    reorderedPageBlocks.splice(
      newIndex,
      0,
      movedBlock
    );

    const updatedPositions =
      reorderedPageBlocks.map(
        (item, index) => ({
          ...item,
          position: index,
        })
      );

    setBlocks((currentBlocks) => {
      return currentBlocks.map(
        (item) => {
          const updated =
            updatedPositions.find(
              (updatedBlock) =>
                updatedBlock.id === item.id
            );

          return updated || item;
        }
      );
    });
  }

  function removeBlock(id: string) {
    setBlocks((current) =>
      current
        .filter((block) => block.id !== id)
        .map((block) => ({
          ...block,
        }))
    );
  }

  async function handleSave() {
    if (!title.trim()) {
      setMessage(
        "Please enter a lesson title."
      );
      return;
    }

    if (pages.length === 0) {
      setMessage(
        "Please add at least one page."
      );
      return;
    }

    setIsSaving(true);
    setMessage("");

    const supabase = createClient();

    // Save lesson title
    const { error: lessonError } = await supabase
      .from("lessons")
      .update({
        title: title.trim(),
      })
      .eq("id", lesson.id);

    if (lessonError) {
      setMessage(lessonError.message);
      setIsSaving(false);
      return;
    }
    /*
      Delete existing blocks first.
      Pages are recreated below.
    */
    const { error: deleteBlocksError } =
      await supabase
        .from("lesson_blocks")
        .delete()
        .eq("lesson_id", lesson.id);

    if (deleteBlocksError) {
      setMessage(deleteBlocksError.message);
      setIsSaving(false);
      return;
    }

    // Delete existing pages
    const { error: deletePagesError } =
      await supabase
        .from("lesson_pages")
        .delete()
        .eq("lesson_id", lesson.id);

    if (deletePagesError) {
      setMessage(deletePagesError.message);
      setIsSaving(false);
      return;
    }

    // Create pages and map temporary IDs
    const pageIdMap = new Map<string, string>();

    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];

      const { data: newPage, error: pageError } =
        await supabase
          .from("lesson_pages")
          .insert({
            lesson_id: lesson.id,
            title:
              page.title.trim() ||
              `Page ${index + 1}`,
            position: index,
          })
          .select()
          .single();

      if (pageError || !newPage) {
        setMessage(
          pageError?.message ||
          "Could not save page."
        );
        setIsSaving(false);
        return;
      }

      pageIdMap.set(
        page.id,
        newPage.id
      );
    }

    // Save blocks
    // Save blocks
    if (blocks.length > 0) {
      const blocksToInsert = blocks.map((block) => {
        const savedPageId = block.page_id
          ? pageIdMap.get(block.page_id)
          : null;

        return {
          id: block.id,
          lesson_id: lesson.id,
          page_id: savedPageId,
          block_type: block.block_type,
          content: block.content ?? "",
          position: block.position,
        };
      });

      const invalidBlock = blocksToInsert.find(
        (block) => !block.page_id
      );

      if (invalidBlock) {
        setMessage(
          "Could not match one or more blocks to a lesson page."
        );
        setIsSaving(false);
        return;
      }

      const { error: blocksError } =
        await supabase
          .from("lesson_blocks")
          .insert(blocksToInsert);

      if (blocksError) {
        setMessage(blocksError.message);
        setIsSaving(false);
        return;
      }
    }
    setMessage(
      "Lesson saved successfully."
    );

    setIsSaving(false);

    // Unpublish course on edit
    fetch("/api/admin/unpublish-on-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: lesson.id }),
    });

    router.refresh();
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      "Are you sure you want to delete this lesson?"
    );

    if (!confirmed) return;

    setIsDeleting(true);

    const supabase = createClient();

    const { error } = await supabase
      .from("lessons")
      .delete()
      .eq("id", lesson.id);

    if (error) {
      setMessage(error.message);
      setIsDeleting(false);
      return;
    }

    router.push(
      `/admin/courses/${courseId}`
    );

    router.refresh();
  }

  const selectedPage =
    pages.find(
      (page) =>
        page.id === selectedPageId
    ) || null;

  const selectedPageBlocks =
    blocks
      .filter(
        (block) =>
          block.page_id === selectedPageId
      )
      .sort(
        (a, b) =>
          a.position - b.position
      );

  const pageBlocks = blocks
    .filter(
      (block) =>
        block.page_id === selectedPageId
    )
    .sort(
      (a, b) =>
        a.position - b.position
    );

  return (
    <div className="space-y-6">
      {/* Lesson title */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Lesson title
        </label>

        <input
          value={title}
          onChange={(event) =>
            setTitle(event.target.value)
          }
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-medium outline-none focus:border-slate-900"
        />
      </div>

      <div className="grid min-h-[calc(100vh-220px)] gap-6 xl:grid-cols-[minmax(0,1fr)_600px]">
        {/* LEFT: LESSON BUILDER */}
        <div className="min-w-0">
          <div className="grid h-full gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* Pages sidebar */}
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 p-5">
                <h2 className="font-semibold text-slate-900">
                  Pages
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Build your lesson page by page.
                </p>
              </div>

              <div className="space-y-1 p-3">
                {pages.map(
                  (page, index) => (
                    <div
                      key={page.id}
                      onDragOver={(e) => {
                        if (dragPageId) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragPageId) reorderPages(dragPageId, page.id);
                        setDragPageId(null);
                      }}
                      className={`group flex items-center gap-1 rounded-xl transition ${
                        selectedPageId === page.id
                          ? "bg-slate-100"
                          : "hover:bg-slate-50"
                      } ${dragPageId === page.id ? "opacity-40" : ""}`}
                    >
                      <span
                        draggable
                        onDragStart={() => setDragPageId(page.id)}
                        onDragEnd={() => setDragPageId(null)}
                        className="cursor-grab pl-2 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        <GripVertical size={15} />
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setSelectedPageId(
                            page.id
                          )
                        }
                        className="flex flex-1 items-center gap-3 px-2 py-3 text-left"
                      >
                        <FileText
                          size={17}
                          className="text-slate-400"
                        />

                        <span className="text-sm font-medium text-slate-700">
                          {index + 1}.{" "}
                          {page.title}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removePage(page.id)
                        }
                        className="mr-2 rounded-lg p-1.5 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )
                )}
              </div>

              <div className="border-t border-slate-200 p-3">
                <button
                  type="button"
                  onClick={addPage}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-slate-500 hover:bg-slate-50"
                >
                  <Plus size={17} />
                  Add Page
                </button>
              </div>
            </div>

            {/* Selected page */}
            <div className="rounded-2xl border border-slate-200 bg-white">
              {selectedPage ? (
                <>
                  <div className="border-b border-slate-200 p-6">
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      Page title
                    </label>

                    <input
                      value={selectedPage.title}
                      onChange={(event) =>
                        updatePageTitle(
                          selectedPage.id,
                          event.target.value
                        )
                      }
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-semibold outline-none focus:border-slate-900"
                    />
                  </div>

                  <div className="space-y-4 p-6">
                    {selectedPageBlocks.length ===
                      0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
                        <p className="text-sm text-slate-500">
                          This page has no content yet.
                        </p>
                      </div>
                    ) : (
                      selectedPageBlocks.map(
                        (block, index) => (
                          <div
                            key={block.id}
                            className="rounded-xl border border-slate-200 bg-slate-50"
                          >
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  moveBlock(block.id, "up")
                                }
                                disabled={block.position === 0}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                                title="Move up"
                              >
                                <ChevronUp size={18} />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  moveBlock(block.id, "down")
                                }
                                disabled={
                                  block.position ===
                                  blocks
                                    .filter(
                                      (item) =>
                                        item.page_id === selectedPageId
                                    )
                                    .length - 1
                                }

                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                                title="Move down"
                              >
                                <ChevronDown size={18} />
                              </button>
                            </div>

                            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                              <span className="text-sm font-medium capitalize text-slate-600">
                                {index + 1}.{" "}
                                {block.block_type}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  removeBlock(
                                    block.id
                                  )
                                }
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <X size={17} />
                              </button>
                            </div>

                            <div className="p-4">
                              {block.block_type ===
                                "heading" && (
                                  <input
                                    value={
                                      block.content ||
                                      ""
                                    }
                                    onChange={(
                                      event
                                    ) =>
                                      updateBlock(
                                        block.id,
                                        event.target
                                          .value
                                      )
                                    }
                                    placeholder="Enter heading..."
                                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-lg font-semibold outline-none focus:border-slate-900"
                                  />
                                )}

                              {block.block_type === "text" && (
                                <RichTextEditor
                                  value={block.content || ""}
                                  onChange={(content) =>
                                    updateBlock(block.id, content)
                                  }
                                />
                              )}

                              {block.block_type === "image" && (
                                <ImageUpload
                                  value={block.content || ""}
                                  onChange={(url) =>
                                    updateBlock(block.id, url)
                                  }
                                  lessonId={lesson.id}
                                />
                              )}

                              {block.block_type === "video" && (
                                <VideoUpload
                                  value={block.content || ""}
                                  onChange={(url) =>
                                    updateBlock(
                                      block.id,
                                      url
                                    )
                                  }
                                />
                              )}

                              {block.block_type === "coding_drill" && (
                                <CodingDrillEditor
                                  value={block.content}
                                  onChange={(serialized) =>
                                    updateBlock(block.id, serialized)
                                  }
                                />
                              )}
                            </div>
                          </div>
                        )
                      )
                    )}

                    {/* Add content */}
                    <div className="grid gap-3 pt-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          addBlock("heading")
                        }
                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"
                      >
                        <Type size={20} />
                        <span className="text-sm font-medium">
                          Heading
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          addBlock("text")
                        }
                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"
                      >
                        <AlignLeft size={20} />
                        <span className="text-sm font-medium">
                          Text
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          addBlock("image")
                        }
                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"
                      >
                        <ImageIcon size={20} />
                        <span className="text-sm font-medium">
                          Image
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          addBlock("video")
                        }
                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"
                      >
                        <Video size={20} />
                        <span className="text-sm font-medium">
                          Video
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          addBlock("coding_drill")
                        }
                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50 sm:col-span-2"
                      >
                        <Film size={20} />
                        <span className="text-sm font-medium">
                          Coding Drill{" "}
                          <span className="font-normal text-slate-400">
                            (video + stats, graded)
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-sm text-slate-500">
                  Add a page to start building your lesson.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: LIVE PREVIEW */}
        <aside className="min-w-0 xl:sticky xl:top-6 xl:h-[calc(100vh-48px)]">
          <LessonPreview
            lessonTitle={title}
            pages={pages}
            blocks={blocks}
            activePageId={selectedPageId ?? undefined}
            onNavigate={setSelectedPageId}
          />
        </aside>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 size={18} />
          {isDeleting
            ? "Deleting..."
            : "Delete Lesson"}
        </button>

        <div className="flex items-center gap-4">
          {message && (
            <span className="text-sm text-slate-500">
              {message}
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Save size={18} />
            {isSaving
              ? "Saving..."
              : "Save Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
}