import type {
  AiLang,
  AiProvider,
  CorrectChoice,
  CreateQuestionBody,
} from "./index";
export type RubricCriterion = {
  id: string;
  description: string;
  maxPoints: number;
};
export type EssayQuestionBody = {
  type: "essay";
  prompt: string;
  referenceAnswer: string;
  rubric: RubricCriterion[];
  lang?: AiLang;
  explanationMarkdown?: string | null;
  choiceA?: null;
  choiceB?: null;
  choiceC?: null;
  choiceD?: null;
  correctChoice?: null;
};
export type QuestionInput =
  | (CreateQuestionBody & {
      type?: "mcq";
      referenceAnswer?: null;
      rubric?: null;
    })
  | EssayQuestionBody;
export type PracticeAnswer =
  { type: "mcq"; choice: CorrectChoice } | { type: "essay"; text: string };
export type GradeResult = {
  score: number;
  criteria: Array<{ criterionId: string; points: number; explanation: string }>;
  strengths: string[];
  gaps: string[];
  improvements: string[];
  correctChoice?: CorrectChoice;
  explanationMarkdown?: string | null;
  referenceAnswer?: string;
};
export type AttemptStatus =
  "in_progress" | "submitting" | "grading_failed" | "completed";
export type PracticeItemState =
  "unanswered" | "answered" | "grading" | "graded" | "grading_failed";
export type PracticeItemView = {
  id: string;
  type: "mcq" | "essay";
  prompt: string;
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
  answer: PracticeAnswer | null;
  revision: number;
  state: PracticeItemState;
  result: GradeResult | null;
};
export type PracticeAttemptView = {
  id: string;
  status: AttemptStatus;
  provider: AiProvider | null;
  items: PracticeItemView[];
  score: number | null;
  correct: number;
  total: number;
};
