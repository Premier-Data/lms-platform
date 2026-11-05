"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Video,
  HelpCircle,
  ClipboardCheck,
  Film,
  GripVertical,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { LessonMenu } from "@/components/lesson-menu";

type Lesson = {
  id: string;
  module_id: string;
  title: string;
  lesson_type: string;
  position: number;
};

type ModuleLessonsProps = {
  courseId: string;
  lessons: Lesson[];
  /** called after reorder/rename/delete so the parent can refresh */
  onChanged?: () => void;
};

function LessonIcon({ type }: { type: string }) {
  const className = "text-slate-400";
  if (type === "video") return <Video size={19} className={className} />;
  if (type === "quiz") return <HelpCircle size={19} className={className} />;
  if (type === "assessment")
    return <ClipboardCheck size={19} className={className} />;
  if (type === "coding_drill") return <Film size={19} className={className} />;
  return <FileText size={19} className={className} />;
}

export function ModuleLessons({
  courseId,
  lessons,
  onChanged,
}: ModuleLessonsProps) {
  const router = useRouter();
  const supabase = createClient();

  const [items, setItems] = useState<Lesson[]>(
    [...lessons].sort((a, b) => a.position - b.position)
  );
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Re-sync when the parent provides a new lessons list (e.g. after a lesson
  // is added/deleted and CourseContent re-queries). Without this the child
  // keeps its initial copy and new lessons never appear.
  useEffect(() => {
    setItems([...lessons].sort((a, b) => a.position - b.position));
  }, [lessons]);

  async function persistOrder(ordered: Lesson[]) {
    setSaving(true);
    // Write each lesson's new position.
    await Promise.all(
      ordered.map((l, i) =>
        supabase.from("lessons").update({ position: i }).eq("id", l.id)
      )
    );
    setSaving(false);
    // Unpublish course on structural edit.
    fetch("/api/admin/unpublish-on-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course_id: courseId }),
    });
    onChanged?.();
    router.refresh();
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const list = [...items];
    const from = list.findIndex((l) => l.id === dragId);
    const to = list.findIndex((l) => l.id === targetId);
    if (from === -1 || to === -1) {
      setDragId(null);
      return;
    }
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const reordered = list.map((l, i) => ({ ...l, position: i }));
    setItems(reordered);
    setDragId(null);
    persistOrder(reordered);
  }

  if (items.length === 0) {
    return (
      <div className="px-6 py-5 text-sm text-slate-400">
        No lessons yet. Add your first lesson.
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {items.map((lesson) => (
        <div
          key={lesson.id}
          onDragOver={(e) => {
            if (dragId) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(lesson.id);
          }}
          className={`flex items-center gap-2 transition ${
            dragId === lesson.id ? "opacity-40" : ""
          } ${saving ? "pointer-events-none" : ""}`}
        >
          <span
            draggable
            onDragStart={() => setDragId(lesson.id)}
            onDragEnd={() => setDragId(null)}
            className="cursor-grab pl-3 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </span>

          <Link
            href={`/admin/courses/${courseId}/lessons/${lesson.id}`}
            className="flex flex-1 items-center gap-4 py-4 pr-6 transition hover:bg-white"
          >
            <LessonIcon type={lesson.lesson_type} />

            <span className="font-medium text-slate-700">{lesson.title}</span>

            <span className="ml-auto rounded-full bg-white px-3 py-1 text-xs capitalize text-slate-400">
              {lesson.lesson_type}
            </span>

            <LessonMenu
              lessonId={lesson.id}
              courseId={courseId}
              title={lesson.title}
              onChanged={onChanged}
            />
          </Link>
        </div>
      ))}
    </div>
  );
}
