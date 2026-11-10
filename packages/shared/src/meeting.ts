/** Browser meeting assistant HTTP contracts. Context is supplied by the caller. */
export type MeetingContext = {
  personal?: string;
  project?: string;
  participants?: string;
  meeting?: string;
};
export type MeetingSetup = {
  inputMode?: "audio" | "captions";
  provider: "openai" | "deepseek";
  sourceLang: "en" | "vi";
  targetLang: "en" | "vi";
  context: MeetingContext;
};
export type MeetingSegment = {
  sequence: number;
  text: string;
  translation: string;
  utteranceId?: string;
  speaker?: string;
};
export type MeetingSession = MeetingSetup & {
  id: string;
  status: "active";
  expiresAt: string;
  nextSequence: number;
  segments: MeetingSegment[];
};
export type MeetingSuggestion = { reply: string; explanation: string };

export type MeetingCaption = {
  sequence: number;
  utteranceId: string;
  text: string;
  speaker?: string;
};
