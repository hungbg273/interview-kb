export type InterviewProvider = "openai" | "deepseek";
export type InterviewLevel =
  "fresher" | "junior" | "middle" | "senior" | "expert";
export type InterviewSetup = {
  /** Legacy single-document fields, retained for saved interviews. */
  source?: "jd" | "cv";
  documentText?: string;
  filename?: string;
  documents?: InterviewDocument[];
  level: InterviewLevel;
  topicIds: string[];
  noteIds: string[];
  lang: "en" | "vi";
  provider: InterviewProvider;
  durationMinutes: number;
  /** Browser voice URI for DeepSeek, or a supported OpenAI voice name. */
  voice?: string;
};
export type InterviewDocument = {
  source: "jd" | "cv";
  filename: string;
  text: string;
};
export type InterviewContext = {
  subjects: Array<{ id: string; name: string }>;
  notes: Array<{ id: string; title: string; body: string }>;
  characters: number;
};
export type InterviewTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
};
export type InterviewFeedback = {
  summary: string;
  assessments: Array<{
    criterion: "correctness" | "depth" | "clarity" | "examples";
    score: number;
    feedback: string;
    evidence: string;
  }>;
  improvements: string[];
  strongerAnswer: string;
};
export type InterviewSession = {
  id: string;
  setup: InterviewSetup;
  context: InterviewContext;
  status: "active" | "finished";
  expiresAt: string;
  turns: InterviewTurn[];
  feedback: InterviewFeedback | null;
};
export type InterviewAvailability = Record<
  InterviewProvider,
  { available: boolean; reason?: string }
>;
export type InterviewRealtimeToken = { value: string; expiresAt: number };
