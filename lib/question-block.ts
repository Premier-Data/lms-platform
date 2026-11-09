// Shared types and grading logic for the one-off "question" lesson block.
//
// A question block lives on a lesson page (like text/image/video blocks) and is
// stored entirely in the block's own `content` as JSON, so no extra tables are
// needed. It mirrors the quiz question format (single choice, multiple choice,
// short answer) but is answered in place on the page.

export type QuestionType = "single_choice" | "multiple_choice" | "short_answer";

/**
 * Progression rule for the question:
 *  - "none":     optional, never blocks progress
 *  - "answered": learner must submit an answer (right or wrong) to continue
 *  - "correct":  learner must get it right (they can retry) to continue
 */
export type QuestionGate = "none" | "answered" | "correct";

export type QuestionOption = {
  id: string;
  /** option label, or (for short answers) an accepted answer */
  content: string;
  is_correct: boolean;
  image_url?: string | null;
};

export type QuestionConfig = {
  question_text: string;
  question_type: QuestionType;
  media_url: string | null;
  media_type: "image" | "video" | null;
  options: QuestionOption[];
  /** feedback shown after the learner answers */
  explanation: string | null;
  gate: QuestionGate;
};

/** A learner's submitted answer, persisted in their course progress. */
export type QuestionAnswer = {
  selected: string[];
  text: string;
  correct: boolean;
};

export function emptyQuestionConfig(): QuestionConfig {
  return {
    question_text: "",
    question_type: "single_choice",
    media_url: null,
    media_type: null,
    options: [
      { id: "opt-0", content: "", is_correct: false },
      { id: "opt-1", content: "", is_correct: false },
    ],
    explanation: null,
    gate: "answered",
  };
}

const TYPES: QuestionType[] = [
  "single_choice",
  "multiple_choice",
  "short_answer",
];
const GATES: QuestionGate[] = ["none", "answered", "correct"];

/** Parse a block's content (JSON string or object) into a QuestionConfig. */
export function parseQuestionConfig(raw: unknown): QuestionConfig {
  const base = emptyQuestionConfig();
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try {
      obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      obj = null;
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return base;

  const question_type = TYPES.includes(obj.question_type as QuestionType)
    ? (obj.question_type as QuestionType)
    : base.question_type;
  const gate = GATES.includes(obj.gate as QuestionGate)
    ? (obj.gate as QuestionGate)
    : base.gate;

  const options = Array.isArray(obj.options)
    ? (obj.options as unknown[]).map((o, i) => {
        const opt = (o ?? {}) as Record<string, unknown>;
        return {
          id: typeof opt.id === "string" && opt.id ? opt.id : `opt-${i}`,
          content: typeof opt.content === "string" ? opt.content : "",
          is_correct: opt.is_correct === true,
          image_url:
            typeof opt.image_url === "string" && opt.image_url
              ? opt.image_url
              : null,
        };
      })
    : base.options;

  return {
    question_text:
      typeof obj.question_text === "string" ? obj.question_text : "",
    question_type,
    media_url:
      typeof obj.media_url === "string" && obj.media_url ? obj.media_url : null,
    media_type:
      obj.media_type === "image" || obj.media_type === "video"
        ? obj.media_type
        : null,
    options: options.length > 0 ? options : base.options,
    explanation:
      typeof obj.explanation === "string" && obj.explanation
        ? obj.explanation
        : null,
    gate,
  };
}

export function serializeQuestionConfig(config: QuestionConfig): string {
  return JSON.stringify(config);
}

/** Grade an answer against the question. */
export function gradeQuestion(
  config: QuestionConfig,
  answer: { selected: string[]; text: string }
): boolean {
  if (config.question_type === "short_answer") {
    const given = answer.text.trim().toLowerCase();
    if (!given) return false;
    return config.options.some(
      (o) =>
        o.is_correct !== false &&
        o.content.trim().toLowerCase() === given
    );
  }

  const correctIds = new Set(
    config.options.filter((o) => o.is_correct).map((o) => o.id)
  );
  const selectedIds = new Set(answer.selected);
  if (correctIds.size === 0 || correctIds.size !== selectedIds.size) {
    return false;
  }
  for (const id of correctIds) {
    if (!selectedIds.has(id)) return false;
  }
  return true;
}

/** Whether the learner's saved answer satisfies the question's gate. */
export function isQuestionSatisfied(
  gate: QuestionGate,
  answer: QuestionAnswer | undefined
): boolean {
  if (gate === "none") return true;
  if (!answer) return false;
  return gate === "correct" ? answer.correct : true;
}

/** Admin-side validation. Returns an error message, or null when valid. */
export function validateQuestionConfig(config: QuestionConfig): string | null {
  if (!config.question_text.trim()) return "Enter the question text.";
  if (config.question_type === "short_answer") {
    const answers = config.options.filter((o) => o.content.trim());
    if (answers.length === 0) return "Add at least one accepted answer.";
    return null;
  }
  const usable = config.options.filter(
    (o) => o.content.trim() || o.image_url
  );
  if (usable.length < 2) return "Add at least two answer options.";
  if (!usable.some((o) => o.is_correct)) {
    return "Tick at least one correct answer.";
  }
  return null;
}
