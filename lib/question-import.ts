// Parses a "question bank" spreadsheet (exported as CSV) into questions that
// can be bulk-imported into a lesson.
//
// Expected columns (header names are matched case-insensitively; extra
// columns such as Course / Module are ignored, and any rows above the header
// row are skipped):
//
//   Lesson | Question | Type | Option 1 … Option N | Correct Answer |
//   Image URL | Video URL
//
// Type:           Multiple Choice, Multi-Select, True/False, Short Answer
// Correct Answer: choice questions -> "Option 2" or "Option 1, Option 3"
//                 (the option text also works); short answers -> the accepted
//                 answers, separated by commas, e.g. "Foot, Feet, Legs".

export type ImportQuestionType =
  | "single_choice"
  | "multiple_choice"
  | "short_answer";

export type ImportedQuestion = {
  /** 1-based spreadsheet row number, for error reporting */
  row: number;
  text: string;
  type: ImportQuestionType;
  /** options for choice questions; accepted answers (all correct) for short answers */
  options: { content: string; is_correct: boolean }[];
  media_url: string | null;
  media_type: "image" | "video" | null;
  /** the raw "Lesson" cell, if the sheet has one */
  lessonRef: string;
  warnings: string[];
};

export type ImportError = { row: number; message: string };

export type ImportParseResult = {
  questions: ImportedQuestion[];
  errors: ImportError[];
};

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normaliseType(
  raw: string
): { kind: "choice" | "multi" | "tf" | "short" } | null {
  const t = norm(raw);
  if (
    ["multiplechoice", "singlechoice", "choice", "mcq", "mc", "singleselect"].includes(
      t
    )
  ) {
    return { kind: "choice" };
  }
  if (["multiselect", "multipleselect", "multipleanswer", "multipleanswers"].includes(t)) {
    return { kind: "multi" };
  }
  if (["truefalse", "tf", "trueorfalse", "boolean"].includes(t)) {
    return { kind: "tf" };
  }
  if (["shortanswer", "short", "text", "freetext", "textanswer"].includes(t)) {
    return { kind: "short" };
  }
  return null;
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,;|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s);
}

/** Parse the CSV text of a question bank. */
export function parseQuestionSheet(csv: string): ImportParseResult {
  const rows = parseCsv(csv);
  const questions: ImportedQuestion[] = [];
  const errors: ImportError[] = [];

  // Find the header row: the first row that has both "Question" and "Type".
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(norm);
    if (cells.includes("question") && cells.includes("type")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    errors.push({
      row: 0,
      message:
        'Could not find a header row. The sheet needs "Question" and "Type" columns.',
    });
    return { questions, errors };
  }

  const header = rows[headerIdx].map(norm);
  const col = (name: string) => header.indexOf(norm(name));
  const cQuestion = col("question");
  const cType = col("type");
  const cLesson = col("lesson");
  const cCorrect = header.findIndex((h) =>
    ["correctanswer", "correctanswers", "answer", "answers", "correct"].includes(h)
  );
  const cImage = header.findIndex((h) => ["imageurl", "image"].includes(h));
  const cVideo = header.findIndex((h) => ["videourl", "video"].includes(h));

  // Option columns, in numeric order: [{ n: 1, index: <column> }, ...]
  const optionCols = header
    .map((h, index) => {
      const m = /^option(\d+)$/.exec(h);
      return m ? { n: parseInt(m[1], 10), index } : null;
    })
    .filter((x): x is { n: number; index: number } => x !== null)
    .sort((a, b) => a.n - b.n);

  if (cCorrect === -1) {
    errors.push({
      row: headerIdx + 1,
      message: 'Missing a "Correct Answer" column.',
    });
    return { questions, errors };
  }

  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 1;
    if (r.every((c) => !c.trim())) continue; // blank row

    const text = cell(r, cQuestion);
    const typeRaw = cell(r, cType);
    if (!text && !typeRaw) continue;
    if (!text) {
      errors.push({ row: rowNo, message: "Question text is empty." });
      continue;
    }

    const type = normaliseType(typeRaw);
    if (!type) {
      errors.push({
        row: rowNo,
        message: `Unknown question type "${typeRaw}". Use Multiple Choice, Multi-Select, True/False or Short Answer.`,
      });
      continue;
    }

    const correctRaw = cell(r, cCorrect);
    const warnings: string[] = [];

    // --- media ---
    const image = cell(r, cImage);
    const video = cell(r, cVideo);
    let media_url: string | null = null;
    let media_type: "image" | "video" | null = null;
    if (image && !isHttpUrl(image)) {
      errors.push({ row: rowNo, message: "Image URL must start with http(s)://." });
      continue;
    }
    if (video && !isHttpUrl(video)) {
      errors.push({ row: rowNo, message: "Video URL must start with http(s)://." });
      continue;
    }
    if (video) {
      media_url = video;
      media_type = "video";
      if (image) warnings.push("Both image and video given; using the video.");
    } else if (image) {
      media_url = image;
      media_type = "image";
    }

    const base = {
      row: rowNo,
      text,
      media_url,
      media_type,
      lessonRef: cell(r, cLesson),
      warnings,
    };

    // --- short answer ---
    if (type.kind === "short") {
      const accepted = splitList(correctRaw);
      if (accepted.length === 0) {
        errors.push({
          row: rowNo,
          message: "Short answer needs at least one accepted answer in Correct Answer.",
        });
        continue;
      }
      questions.push({
        ...base,
        type: "short_answer",
        options: accepted.map((content) => ({ content, is_correct: true })),
      });
      continue;
    }

    // --- choice questions ---
    // Keep the original option number so "Option 3" resolves correctly even
    // if an earlier option cell is blank.
    let opts: { n: number; content: string }[] = optionCols
      .map((oc) => ({ n: oc.n, content: cell(r, oc.index) }))
      .filter((o) => o.content);

    if (type.kind === "tf" && opts.length === 0) {
      opts = [
        { n: 1, content: "True" },
        { n: 2, content: "False" },
      ];
    }
    if (type.kind === "tf") {
      opts = opts.map((o) => ({
        ...o,
        content: /^true$/i.test(o.content)
          ? "True"
          : /^false$/i.test(o.content)
            ? "False"
            : o.content,
      }));
    }

    if (opts.length < 2) {
      errors.push({ row: rowNo, message: "Needs at least two options." });
      continue;
    }

    const tokens = splitList(correctRaw);
    if (tokens.length === 0) {
      errors.push({ row: rowNo, message: "Correct Answer is empty." });
      continue;
    }

    const correctIdx = new Set<number>();
    let bad: string | null = null;
    for (const token of tokens) {
      const prefixed = /^option\s*(\d+)$/i.exec(token);
      const byText = opts.findIndex(
        (o) => o.content.toLowerCase() === token.toLowerCase()
      );
      if (prefixed) {
        const idx = opts.findIndex((o) => o.n === parseInt(prefixed[1], 10));
        if (idx === -1) {
          bad = token;
          break;
        }
        correctIdx.add(idx);
      } else if (byText !== -1) {
        correctIdx.add(byText);
      } else if (/^\d+$/.test(token)) {
        const idx = opts.findIndex((o) => o.n === parseInt(token, 10));
        if (idx === -1) {
          bad = token;
          break;
        }
        correctIdx.add(idx);
      } else {
        bad = token;
        break;
      }
    }
    if (bad !== null) {
      errors.push({
        row: rowNo,
        message: `Correct Answer "${bad}" doesn't match any option. Use "Option 1", "Option 2"… or the option text.`,
      });
      continue;
    }

    const multiple = type.kind === "multi" || correctIdx.size > 1;
    questions.push({
      ...base,
      type: multiple ? "multiple_choice" : "single_choice",
      options: opts.map((o, idx) => ({
        content: o.content,
        is_correct: correctIdx.has(idx),
      })),
    });
  }

  return { questions, errors };
}

export const IMPORT_COLUMNS = [
  "Course",
  "Module",
  "Lesson",
  "Question",
  "Type",
  "Option 1",
  "Option 2",
  "Option 3",
  "Option 4",
  "Option 5",
  "Correct Answer",
  "Image URL",
  "Video URL",
];

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The downloadable import template: instruction rows (skipped on import
 * because they sit above the header row), the header, and one example per
 * question type. `lessonUrl` pre-fills the Lesson column of the examples.
 */
export function buildImportTemplate(lessonUrl = ""): string {
  const instructions = [
    "QUESTION IMPORT TEMPLATE - keep the header row below exactly as it is. The instruction rows above the header are ignored on import. DELETE THE FOUR EXAMPLE ROWS below the header, or they will be imported as real questions.",
    "Type: Multiple Choice | Multi-Select | True/False | Short Answer",
    'Correct Answer (choice questions): "Option 2" or, for several, "Option 1, Option 3". Use the option number or the option text.',
    'Correct Answer (Short Answer): every accepted answer, separated by commas, e.g. "Foot, Feet". Not case sensitive.',
    "Options: fill Option 1 to Option 5 as needed (at least 2). True/False can leave options blank or use TRUE and FALSE.",
    "Image URL / Video URL: optional, must start with https://. YouTube links work for video. If both are given the video is used.",
    "Lesson: optional. Rows whose Lesson holds this lesson's URL can be imported on their own. Course and Module are for your reference only.",
  ];

  const row = (cells: Record<string, string>) =>
    IMPORT_COLUMNS.map((c) => csvField(cells[c] ?? "")).join(",");

  const examples: Record<string, string>[] = [
    {
      Lesson: lessonUrl,
      Question: "What shape is a soccer ball?",
      Type: "Multiple Choice",
      "Option 1": "Round",
      "Option 2": "Oval",
      "Option 3": "Square",
      "Option 4": "Triangle",
      "Correct Answer": "Option 1",
    },
    {
      Lesson: lessonUrl,
      Question: "Which of the following are outfield positions?",
      Type: "Multi-Select",
      "Option 1": "Striker",
      "Option 2": "Midfielder",
      "Option 3": "Defender",
      "Option 4": "Quarterback",
      "Correct Answer": "Option 1, Option 2, Option 3",
    },
    {
      Lesson: lessonUrl,
      Question: "A goalkeeper may handle the ball outside the penalty box.",
      Type: "True/False",
      "Option 1": "TRUE",
      "Option 2": "FALSE",
      "Correct Answer": "Option 2",
    },
    {
      Lesson: lessonUrl,
      Question: "What part of the body do you primarily use in soccer?",
      Type: "Short Answer",
      "Correct Answer": "Foot, Feet, Legs",
    },
  ];

  return [
    ...instructions.map((line) => csvField(line)),
    "",
    IMPORT_COLUMNS.join(","),
    ...examples.map(row),
  ].join("\r\n");
}

/** Whether a row's Lesson cell refers to the given lesson (URL or id). */
export function lessonRefMatches(ref: string, lessonId: string): boolean {
  return !!ref && ref.toLowerCase().includes(lessonId.toLowerCase());
}
