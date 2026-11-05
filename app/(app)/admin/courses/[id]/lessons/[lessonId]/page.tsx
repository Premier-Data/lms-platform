import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Video,
  HelpCircle,
  ClipboardCheck,
  Film,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { LessonEditorForm } from "@/components/lesson-editor-form";
import { QuizEditor } from "@/components/quiz-editor";
import { CodingDrillLessonEditor } from "@/components/coding-drill-lesson-editor";

type LessonEditorPageProps = {
  params: Promise<{
    id: string;
    lessonId: string;
  }>;
};

export default async function LessonEditorPage({
  params,
}: LessonEditorPageProps) {
  const { id, lessonId } = await params;

  const supabase = await createClient();

  // Get the lesson directly
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();

  if (lessonError || !lesson) {
    console.error("LESSON ERROR:", lessonError);
    notFound();
  }

  // Get the module separately
  const { data: module, error: moduleError } = await supabase
    .from("modules")
    .select("*")
    .eq("id", lesson.module_id)
    .single();

  if (moduleError || !module) {
    console.error("MODULE ERROR:", moduleError);
    notFound();
  }

  // Make sure this module belongs to the course in the URL
  if (module.course_id !== id) {
    notFound();
  }

  // Get lesson pages
  const { data: pages, error: pagesError } = await supabase
    .from("lesson_pages")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: true });

  if (pagesError) {
    console.error("PAGES ERROR:", pagesError);
  }

  // Get lesson blocks
  const { data: blocks, error: blocksError } = await supabase
    .from("lesson_blocks")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("position", { ascending: true });

  if (blocksError) {
    console.error("BLOCKS ERROR:", blocksError);
  }

  return (
    <div className="w-full max-w-none">
      <Link
        href={`/admin/courses/${id}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={18} />
        Back to {module.title || "Course"}
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <LessonTypeIcon type={lesson.lesson_type} />

          <span className="text-sm font-medium capitalize text-slate-500">
            {lesson.lesson_type}
          </span>
        </div>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
          Edit Lesson
        </h1>
      </div>

      {lesson.lesson_type === "quiz" ? (
        <QuizEditor lessonId={lesson.id} lessonTitle={lesson.title} />
      ) : lesson.lesson_type === "coding_drill" ? (
        <CodingDrillLessonEditor
          lessonId={lesson.id}
          courseId={id}
          initialTitle={lesson.title}
          initialContent={
            typeof lesson.content === "string"
              ? lesson.content
              : lesson.content
                ? JSON.stringify(lesson.content)
                : null
          }
        />
      ) : (
        <LessonEditorForm
          lesson={{
            id: lesson.id,
            title: lesson.title,
            lesson_type: lesson.lesson_type,
            content: lesson.content,
            video_url: lesson.video_url,
            image_url: lesson.image_url,
          }}
          initialPages={pages || []}
          initialBlocks={blocks || []}
          courseId={id}
        />
      )}
    </div>
  );
}

function LessonTypeIcon({
  type,
}: {
  type: string;
}) {
  const className =
    "flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600";

  if (type === "video") {
    return (
      <div className={className}>
        <Video size={20} />
      </div>
    );
  }

  if (type === "quiz") {
    return (
      <div className={className}>
        <HelpCircle size={20} />
      </div>
    );
  }

  if (type === "assessment") {
    return (
      <div className={className}>
        <ClipboardCheck size={20} />
      </div>
    );
  }

  if (type === "coding_drill") {
    return (
      <div className={className}>
        <Film size={20} />
      </div>
    );
  }

  return (
    <div className={className}>
      <FileText size={20} />
    </div>
  );
}