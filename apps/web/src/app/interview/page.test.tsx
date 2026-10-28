import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { InterviewSession } from "@kb/shared";

const { api, createRealtimeVoice, close, startDictation, stopSpeech } =
  vi.hoisted(() => ({
    api: vi.fn(),
    createRealtimeVoice: vi.fn(),
    close: vi.fn(),
    startDictation: vi.fn(),
    stopSpeech: vi.fn(),
  }));
vi.mock("@/lib/api", () => ({ api }));
vi.mock("@/lib/interview-voice", () => ({
  createRealtimeVoice,
  supportsSpeechRecognition: () => false,
  startDictation,
  speakInterviewText: vi.fn(),
  stopInterviewSpeech: stopSpeech,
  observeInterviewVoices: (
    lang: string,
    callback: (voices: unknown[]) => void,
  ) => {
    callback([
      {
        id: `voice-${lang}`,
        name: lang === "vi" ? "Vietnamese Natural" : "English Natural",
        lang: lang === "vi" ? "vi-VN" : "en-US",
        local: true,
        isDefault: true,
      },
    ]);
    return () => {};
  },
}));
import InterviewPage from "./page";

let session: InterviewSession;
beforeEach(() => {
  localStorage.clear();
  session = {
    id: "session-1",
    status: "active",
    expiresAt: new Date(Date.now() + 1_200_000).toISOString(),
    feedback: null,
    setup: {
      source: "jd",
      documentText: "Backend engineer with PostgreSQL experience",
      filename: "role.pdf",
      level: "junior",
      topicIds: ["t1"],
      noteIds: [],
      lang: "en",
      provider: "deepseek",
      durationMinutes: 20,
    },
    context: {
      subjects: [{ id: "t1", name: "Databases" }],
      notes: [{ id: "n1", title: "Transactions", body: "ACID" }],
      characters: 100,
    },
    turns: [
      {
        id: "q1",
        role: "assistant",
        text: "Explain a transaction you have used.",
      },
    ],
  };
  api.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/interviews/providers")
      return { openai: { available: true }, deepseek: { available: true } };
    if (path.startsWith("/search?"))
      return { topics: [{ id: "t1", name: "Databases" }], notes: [] };
    if (path === "/interviews/documents")
      return { filename: "role.pdf", text: session.setup.documentText };
    if (path === "/interviews/preview") return session.context;
    if (path === "/interviews") {
      session.setup = JSON.parse(init?.body as string);
      return { ...session };
    }
    if (path.endsWith("/realtime"))
      return { value: "ephemeral-token", expiresAt: Date.now() / 1000 + 60 };
    if (path.endsWith("/transcript")) return session;
    if (path.endsWith("/turn")) {
      const answer = JSON.parse(init?.body as string);
      session = {
        ...session,
        turns: [
          ...session.turns,
          { ...answer, role: "user" },
          { id: "q2", role: "assistant", text: "What happens on rollback?" },
        ],
      };
      return session;
    }
    if (path.endsWith("/finish"))
      return {
        ...session,
        status: "finished",
        feedback: {
          summary: "Good foundation.",
          assessments: [],
          improvements: ["Give a concrete example."],
          strongerAnswer:
            "I used a transaction to update two related records atomically.",
        },
      };
    throw new Error(`Unexpected ${path}`);
  });
  createRealtimeVoice.mockResolvedValue({
    close,
    sendText: vi.fn(),
    setMuted: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function prepare(provider = "deepseek") {
  await screen.findByRole("option", { name: /DeepSeek/ });
  fireEvent.change(screen.getByLabelText("JD or CV file"), {
    target: {
      files: [new File(["file"], "role.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByDisplayValue(
    "Backend engineer with PostgreSQL experience",
  );
  fireEvent.change(screen.getByLabelText("Search subjects or notes"), {
    target: { value: "Data" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Add subject Databases" }),
  );
  fireEvent.change(screen.getByLabelText("Interview language"), {
    target: { value: "en" },
  });
  fireEvent.change(screen.getByLabelText("AI provider"), {
    target: { value: provider },
  });
  fireEvent.change(screen.getByLabelText("Target level"), {
    target: { value: "senior" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review interview" }));
  await screen.findByRole("heading", { name: "Your interview brief" });
}

it("requires at least one context source before review", async () => {
  render(<InterviewPage />);
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeDisabled();
  await screen.findByRole("option", { name: /DeepSeek/ });
  expect(
    await screen.findByText("Add a JD, CV, subject, or note to continue."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toHaveAttribute("aria-describedby", "interview-review-hint");
  expect(api).not.toHaveBeenCalledWith("/interviews", expect.anything());
});

it("explains an empty reviewed document instead of silently disabling review", async () => {
  render(<InterviewPage />);
  fireEvent.change(screen.getByLabelText("JD or CV file"), {
    target: {
      files: [new File(["pdf"], "role.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByDisplayValue(
    "Backend engineer with PostgreSQL experience",
  );
  fireEvent.change(screen.getByLabelText("Review document text"), {
    target: { value: "  " },
  });
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeDisabled();
  expect(
    screen.getByText("Review or remove the empty JD document to continue."),
  ).toBeInTheDocument();
});

it("reviews resolved materials and sends the selected setup to DeepSeek", async () => {
  render(<InterviewPage />);
  await prepare();
  expect(screen.getByText("Transactions")).toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith("/interviews", expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await screen.findByText("Explain a transaction you have used.");
  const start = api.mock.calls.find(([path]) => path === "/interviews");
  expect(JSON.parse(start![1].body)).toMatchObject({
    provider: "deepseek",
    level: "senior",
    documents: [
      {
        source: "jd",
        filename: "role.pdf",
        text: "Backend engineer with PostgreSQL experience",
      },
    ],
    lang: "en",
    topicIds: ["t1"],
  });
  expect(
    screen.getByText(/Speech recognition is unavailable/),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Your answer"), {
    target: { value: "I used an atomic transaction." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await screen.findByText("What happens on rollback?");
  fireEvent.click(screen.getByRole("button", { name: "Finish interview" }));
  await screen.findByText("Good foundation.");
  expect(stopSpeech).toHaveBeenCalled();
  expect(createRealtimeVoice).not.toHaveBeenCalled();
});

it("starts from a JD alone without requiring library selections", async () => {
  render(<InterviewPage />);
  await screen.findByRole("option", { name: /DeepSeek/ });
  fireEvent.change(screen.getByLabelText("JD or CV file"), {
    target: {
      files: [new File(["pdf"], "role.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByDisplayValue(
    "Backend engineer with PostgreSQL experience",
  );
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Review interview" }));
  await screen.findByRole("heading", { name: "Your interview brief" });
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await screen.findByText("Explain a transaction you have used.");
  const start = api.mock.calls.find(([path]) => path === "/interviews");
  expect(JSON.parse(start![1].body)).toMatchObject({
    documents: [{ source: "jd", filename: "role.pdf" }],
    topicIds: [],
    noteIds: [],
  });
});

it("starts from a subject alone without requiring an uploaded document", async () => {
  render(<InterviewPage />);
  fireEvent.change(screen.getByLabelText("Search subjects or notes"), {
    target: { value: "Data" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Add subject Databases" }),
  );
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Review interview" }));
  await screen.findByRole("heading", { name: "Your interview brief" });
  expect(screen.queryByText("Review JD text")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await screen.findByText("Explain a transaction you have used.");
  const start = api.mock.calls.find(([path]) => path === "/interviews");
  const setup = JSON.parse(start![1].body);
  expect(setup.documents).toEqual([]);
  expect(setup.topicIds).toEqual(["t1"]);
  expect(setup.source).toBeUndefined();
  expect(setup.documentText).toBeUndefined();
});

it("combines a JD and CV and keeps their independently reviewed text", async () => {
  render(<InterviewPage />);
  fireEvent.change(screen.getByLabelText("JD or CV file"), {
    target: {
      files: [new File(["pdf"], "role.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByDisplayValue(
    "Backend engineer with PostgreSQL experience",
  );
  fireEvent.change(screen.getByLabelText("Document type"), {
    target: { value: "cv" },
  });
  const implementation = api.getMockImplementation()!;
  api.mockImplementation((path, init) =>
    path === "/interviews/documents"
      ? Promise.resolve({
          filename: "candidate.pdf",
          text: "Built distributed payment services.",
        })
      : implementation(path, init),
  );
  fireEvent.change(screen.getByLabelText("JD or CV file"), {
    target: {
      files: [new File(["pdf"], "candidate.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByDisplayValue("Built distributed payment services.");
  fireEvent.change(screen.getByLabelText("Review document text"), {
    target: { value: "Built reliable payment services." },
  });
  fireEvent.change(screen.getByLabelText("Search subjects or notes"), {
    target: { value: "Data" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Add subject Databases" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review interview" }));
  await screen.findByRole("heading", { name: "Your interview brief" });
  expect(screen.getByText("JD · role.pdf")).toBeInTheDocument();
  expect(screen.getByText("CV · candidate.pdf")).toBeInTheDocument();
  const preview = api.mock.calls.find(
    ([path]) => path === "/interviews/preview",
  );
  expect(JSON.parse(preview![1].body)).toMatchObject({
    documents: [
      { source: "jd", text: "Backend engineer with PostgreSQL experience" },
      { source: "cv", text: "Built reliable payment services." },
    ],
    topicIds: ["t1"],
  });
});

it("disables review again after the last context source is removed", async () => {
  render(<InterviewPage />);
  fireEvent.change(screen.getByLabelText("JD or CV file"), {
    target: {
      files: [new File(["pdf"], "role.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByDisplayValue(
    "Backend engineer with PostgreSQL experience",
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove JD" }));
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Search subjects or notes"), {
    target: { value: "Data" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Add subject Databases" }),
  );
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Remove Databases" }));
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeDisabled();
});

it("uses an ephemeral credential for OpenAI and closes audio before finishing", async () => {
  render(<InterviewPage />);
  await prepare("openai");
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await waitFor(() =>
    expect(createRealtimeVoice).toHaveBeenCalledWith(
      expect.objectContaining({ token: "ephemeral-token", lang: "en" }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Finish interview" }));
  await screen.findByText("Good foundation.");
  expect(close).toHaveBeenCalledOnce();
  const finishCall = api.mock.calls.findIndex(([path]) =>
    path.endsWith("/finish"),
  );
  expect(close.mock.invocationCallOrder[0]).toBeLessThan(
    api.mock.invocationCallOrder[finishCall],
  );
});

it("keeps the answer and id for an explicit retry after a provider failure", async () => {
  render(<InterviewPage />);
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await screen.findByText("Explain a transaction you have used.");
  const implementation = api.getMockImplementation()!;
  let fail = true;
  api.mockImplementation(async (path, init) => {
    if (path.endsWith("/turn") && fail) {
      fail = false;
      throw new Error("Provider unavailable");
    }
    return implementation(path, init);
  });
  fireEvent.change(screen.getByLabelText("Your answer"), {
    target: { value: "Atomic updates." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await screen.findByText("Provider unavailable");
  expect(screen.getByLabelText("Your answer")).toHaveValue("Atomic updates.");
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await screen.findByText("What happens on rollback?");
  const calls = api.mock.calls.filter(([path]) => path.endsWith("/turn"));
  expect(JSON.parse(calls[0][1].body).id).toBe(JSON.parse(calls[1][1].body).id);
});

it("disables unavailable providers and explains server configuration", async () => {
  const implementation = api.getMockImplementation()!;
  api.mockImplementation(async (path, init) =>
    path === "/interviews/providers"
      ? {
          openai: {
            available: false,
            reason: "Configure OPENAI_API_KEY on the server.",
          },
          deepseek: {
            available: false,
            reason: "Configure DEEPSEEK_API_KEY on the server.",
          },
        }
      : implementation(path, init),
  );
  render(<InterviewPage />);
  expect(
    await screen.findByRole('status'),
  ).toHaveTextContent("Configure DEEPSEEK_API_KEY on the server.");
  expect(screen.getByRole("option", { name: /OpenAI/ })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Review interview" }),
  ).toBeDisabled();
});

it("preserves pending OpenAI turns when transcript saving fails and retries before feedback", async () => {
  render(<InterviewPage />);
  await prepare("openai");
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await waitFor(() => expect(createRealtimeVoice).toHaveBeenCalled());
  const callback = createRealtimeVoice.mock.calls[0][0].onTurn;
  const implementation = api.getMockImplementation()!;
  let fail = true;
  api.mockImplementation(async (path, init) => {
    if (path.endsWith("/transcript") && fail) throw new Error("Network down");
    return implementation(path, init);
  });
  const { act } = await import("@testing-library/react");
  await act(async () =>
    callback({
      id: "spoken-answer",
      role: "user",
      text: "A transaction is atomic.",
    }),
  );
  await screen.findByText(/Transcript has not saved/);
  fireEvent.click(screen.getByRole("button", { name: "Finish interview" }));
  await screen.findByRole("button", { name: "Retry finishing & feedback" });
  expect(
    api.mock.calls.filter(([path]) => path.endsWith("/finish")),
  ).toHaveLength(0);
  fail = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry finishing & feedback" }),
  );
  await screen.findByText("Good foundation.");
  const saves = api.mock.calls.filter(([path]) => path.endsWith("/transcript"));
  expect(JSON.parse(saves.at(-1)![1].body).turns).toContainEqual({
    id: "spoken-answer",
    role: "user",
    text: "A transaction is atomic.",
  });
});

it("reopens a saved finished session with failed feedback and allows retry", async () => {
  localStorage.setItem("kb:last-interview", session.id);
  const implementation = api.getMockImplementation()!;
  api.mockImplementation(async (path, init) =>
    path === "/interviews/session-1"
      ? { ...session, status: "finished", feedback: null }
      : implementation(path, init),
  );
  render(<InterviewPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Open last interview" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry finishing & feedback" }),
  );
  await screen.findByText("Good foundation.");
});

it("requires the current question ID when submitting a DeepSeek answer", async () => {
  render(<InterviewPage />);
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await screen.findByText("Explain a transaction you have used.");
  fireEvent.change(screen.getByLabelText("Your answer"), {
    target: { value: "Use atomic updates." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await screen.findByText("What happens on rollback?");
  const turn = api.mock.calls.find(([path]) => path.endsWith("/turn"));
  expect(JSON.parse(turn![1].body).afterTurnId).toBe("q1");
});

it("retries OpenAI feedback after the server has already committed the finish state", async () => {
  render(<InterviewPage />);
  await prepare("openai");
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await waitFor(() => expect(createRealtimeVoice).toHaveBeenCalled());
  const { act } = await import("@testing-library/react");
  await act(async () =>
    createRealtimeVoice.mock.calls[0][0].onTurn({
      id: "answer-1",
      role: "user",
      text: "Atomic writes.",
    }),
  );
  await waitFor(() =>
    expect(api.mock.calls.some(([path]) => path.endsWith("/transcript"))).toBe(
      true,
    ),
  );
  const implementation = api.getMockImplementation()!;
  let serverFinished = false;
  api.mockImplementation(async (path, init) => {
    if (path.endsWith("/transcript") && serverFinished)
      throw new Error("This interview has ended.");
    if (path.endsWith("/finish") && !serverFinished) {
      serverFinished = true;
      throw new Error("Evaluation timed out");
    }
    return implementation(path, init);
  });
  fireEvent.click(screen.getByRole("button", { name: "Finish interview" }));
  await screen.findByText(/Evaluation timed out/);
  fireEvent.click(
    screen.getByRole("button", { name: "Retry finishing & feedback" }),
  );
  await screen.findByText("Good foundation.");
});

it("drains the final OpenAI transcription before saving and evaluating", async () => {
  const drain = vi.fn(async () => {
    createRealtimeVoice.mock.calls[0][0].onTurn({
      id: "last-answer",
      role: "user",
      text: "My final example.",
    });
    return { drained: true };
  });
  createRealtimeVoice.mockResolvedValue({
    close,
    sendText: vi.fn(),
    setMuted: vi.fn(),
    finish: drain,
  });
  render(<InterviewPage />);
  await prepare("openai");
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await waitFor(() => expect(createRealtimeVoice).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Finish interview" }));
  await screen.findByText("Good foundation.");
  expect(drain).toHaveBeenCalledOnce();
  const saved = api.mock.calls.filter(([path]) => path.endsWith("/transcript"));
  expect(JSON.parse(saved.at(-1)![1].body).turns).toContainEqual({
    id: "last-answer",
    role: "user",
    text: "My final example.",
  });
});

it("keeps the selected English voice in the interview setup and question playback", async () => {
  render(<InterviewPage />);
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Edit brief" }));
  fireEvent.change(screen.getByLabelText("Interviewer voice"), {
    target: { value: "voice-en" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review interview" }));
  await screen.findByRole("heading", { name: "Your interview brief" });
  expect(
    screen.getByText("Voice · English Natural (en-US)"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start interview" }));
  await screen.findByText("Explain a transaction you have used.");
  const start = api.mock.calls.find(([path]) => path === "/interviews");
  expect(JSON.parse(start![1].body).voice).toBe("voice-en");
  const { speakInterviewText } = await import("@/lib/interview-voice");
  expect(speakInterviewText).toHaveBeenCalledWith(
    expect.any(String),
    "en",
    expect.any(Function),
    "voice-en",
  );
});

it("resets a browser voice when switching interview language or provider", async () => {
  render(<InterviewPage />);
  await screen.findByRole("option", { name: "Vietnamese Natural (vi-VN)" });
  fireEvent.change(screen.getByLabelText("Interviewer voice"), {
    target: { value: "voice-vi" },
  });
  fireEvent.change(screen.getByLabelText("Interview language"), {
    target: { value: "en" },
  });
  await screen.findByRole("option", { name: "English Natural (en-US)" });
  expect(screen.getByLabelText("Interviewer voice")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Interviewer voice"), {
    target: { value: "voice-en" },
  });
  fireEvent.change(screen.getByLabelText("AI provider"), {
    target: { value: "openai" },
  });
  expect(screen.getByLabelText("Interviewer voice")).toHaveValue("marin");
});

it("resets browser voice when provider availability automatically switches to OpenAI", async () => {
  const implementation = api.getMockImplementation()!;
  let resolve!: (value: unknown) => void;
  api.mockImplementation((path, init) =>
    path === "/interviews/providers"
      ? new Promise((done) => {
          resolve = done;
        })
      : implementation(path, init),
  );
  render(<InterviewPage />);
  await screen.findByRole("option", { name: "Vietnamese Natural (vi-VN)" });
  fireEvent.change(screen.getByLabelText("Interviewer voice"), {
    target: { value: "voice-vi" },
  });
  const { act } = await import("@testing-library/react");
  await act(async () =>
    resolve({ openai: { available: true }, deepseek: { available: false } }),
  );
  expect(screen.getByLabelText("Interviewer voice")).toHaveValue("marin");
  fireEvent.change(screen.getByLabelText("JD or CV file"), {
    target: {
      files: [new File(["file"], "role.pdf", { type: "application/pdf" })],
    },
  });
  await screen.findByDisplayValue(
    "Backend engineer with PostgreSQL experience",
  );
  fireEvent.change(screen.getByLabelText("Search subjects or notes"), {
    target: { value: "Data" },
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Add subject Databases" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review interview" }));
  await screen.findByRole("heading", { name: "Your interview brief" });
  const preview = api.mock.calls.find(
    ([path]) => path === "/interviews/preview",
  );
  expect(JSON.parse(preview![1].body).voice).toBe("marin");
});
