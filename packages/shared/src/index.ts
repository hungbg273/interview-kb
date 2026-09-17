export type CorrectChoice = 'A' | 'B' | 'C' | 'D';
export type QuestionSource = 'manual' | 'ai';
export type AiProvider = 'openai' | 'deepseek';
export type AiAction = 'summarize' | 'expand' | 'generate-questions';

export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  AI_UPSTREAM: 'AI_UPSTREAM',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ApiErrorBody = {
  error: { code: ErrorCode | string; message: string };
};

export function isAdminEmail(email: string, allowList: string): boolean {
  const needle = email.trim().toLowerCase();
  return allowList
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'item';
}

export type CreateQuestionBody = {
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  correctChoice: CorrectChoice;
  explanationMarkdown?: string | null;
};

export function isValidMcq(input: {
  prompt?: unknown;
  choiceA?: unknown;
  choiceB?: unknown;
  choiceC?: unknown;
  choiceD?: unknown;
  correctChoice?: unknown;
}): input is CreateQuestionBody {
  const letters: CorrectChoice[] = ['A', 'B', 'C', 'D'];
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return (
    nonEmpty(input.prompt) &&
    nonEmpty(input.choiceA) &&
    nonEmpty(input.choiceB) &&
    nonEmpty(input.choiceC) &&
    nonEmpty(input.choiceD) &&
    letters.includes(input.correctChoice as CorrectChoice)
  );
}