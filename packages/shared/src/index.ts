export type CorrectChoice = "A" | "B" | "C" | "D";
export type QuestionSource = "manual" | "ai";
export type AiProvider = "chatgpt" | "openai" | "deepseek";
export type AiAction =
  | "summarize"
  | "expand"
  | "generate-questions"
  | "generate-content"
  | "translate-note"
  | "summarize-video";
export type AiLang = "en" | "vi";
export type AiDifficulty = "easy" | "medium" | "hard";
export type VideoPlatform = "youtube" | "tiktok" | "facebook";

export const ERROR_CODES = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  CYCLE: "CYCLE",
  AI_UPSTREAM: "AI_UPSTREAM",
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_NOT_CONFIGURED: "AI_NOT_CONFIGURED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ApiErrorBody = {
  error: { code: ErrorCode | string; message: string };
};

export function isAdminEmail(email: string, allowList: string): boolean {
  const needle = email.trim().toLowerCase();
  return allowList
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "item";
}

export type CreateQuestionBody = {
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  correctChoice: CorrectChoice;
  explanationMarkdown?: string | null;
  lang?: AiLang;
};

export function isValidMcq(input: {
  prompt?: unknown;
  choiceA?: unknown;
  choiceB?: unknown;
  choiceC?: unknown;
  choiceD?: unknown;
  correctChoice?: unknown;
}): input is CreateQuestionBody {
  const letters: CorrectChoice[] = ["A", "B", "C", "D"];
  const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return (
    nonEmpty(input.prompt) &&
    nonEmpty(input.choiceA) &&
    nonEmpty(input.choiceB) &&
    nonEmpty(input.choiceC) &&
    nonEmpty(input.choiceD) &&
    letters.includes(input.correctChoice as CorrectChoice)
  );
}
export type AiJobStatus =
  "queued" | "running" | "retrying" | "succeeded" | "failed";
export type AiJobView = {
  id: string;
  noteId: string | null;
  noteTitle: string;
  action: AiAction | "import-document" | "grade-practice-answer";
  provider: AiProvider;
  attemptId?: string;
  status: AiJobStatus;
  stage: string;
  revision: number;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  error: { code: string; message: string } | null;
};
export type AiJobResult = {
  markdown?: string;
  title?: string;
  sourceUrl?: string;
  questionIds?: string[];
  sourceHash: string;
  draftId?: string;
  attemptId?: string;
  items?: Array<{
    id: string;
    type?: "mcq" | "essay";
    prompt: string;
    choiceA?: string | null;
    choiceB?: string | null;
    choiceC?: string | null;
    choiceD?: string | null;
    suggestedTopics: string[];
  }>;
};
export type * from "./interview";
// OpenAI's documented quality recommendations; do not fill the list with less
// preferred options simply to reach a quota of voices.
export const OPENAI_INTERVIEW_VOICES = ["marin", "cedar"] as const;
export type * from "./meeting";
export type * from "./practice";
import type { QuestionInput } from "./practice";
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
export function isValidQuestion(value: unknown): value is QuestionInput {
  if (!value || typeof value !== "object") return false;
  const q = value as Record<string, unknown>;
  if (!text(q.prompt, 10000)) return false;
  if (q.type === "essay") {
    if (
      !text(q.referenceAnswer, 10000) ||
      !Array.isArray(q.rubric) ||
      q.rubric.length < 1 ||
      q.rubric.length > 10
    )
      return false;
    if (
      ["choiceA", "choiceB", "choiceC", "choiceD", "correctChoice"].some(
        (k) => q[k] != null,
      )
    )
      return false;
    const ids = new Set<string>();
    let total = 0;
    for (const r of q.rubric) {
      if (
        !r ||
        !text(r.id, 100) ||
        ids.has(r.id) ||
        !text(r.description, 1000) ||
        typeof r.maxPoints !== "number" ||
        !Number.isFinite(r.maxPoints) ||
        r.maxPoints <= 0 ||
        r.maxPoints > 10
      )
        return false;
      ids.add(r.id);
      total += r.maxPoints;
    }
    return Math.abs(total - 10) < 1e-8;
  }
  return (
    (q.type == null || q.type === "mcq") &&
    q.referenceAnswer == null &&
    q.rubric == null &&
    ["choiceA", "choiceB", "choiceC", "choiceD"].every((k) =>
      text(q[k], 2000),
    ) &&
    ["A", "B", "C", "D"].includes(q.correctChoice as string)
  );
}
