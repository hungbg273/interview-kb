import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/AuthGate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-gate">{children}</div>
  ),
}));

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api,
  API_URL: "http://localhost:4000",
}));

import PracticePage from "./page";
import { AiJobsProvider } from "@/components/AiJobsProvider";

afterEach(() => {
  cleanup();
  api.mockReset();
  localStorage.clear();
});

describe("PracticePage", () => {
  it("starts a persisted mixed quiz, saves answers and submits the remaining questions", async () => {
    let attempt = {
      id: "a1",
      status: "in_progress",
      provider: "openai",
      score: null as number | null,
      correct: 0,
      total: 2,
      items: [
        {
          id: "q1",
          type: "mcq",
          prompt: "SYN first?",
          choiceA: "yes",
          choiceB: "no",
          choiceC: "maybe",
          choiceD: "never",
          answer: null as unknown,
          revision: 0,
          state: "unanswered",
          result: null as unknown,
        },
        {
          id: "q2",
          type: "essay",
          prompt: "Explain ACK",
          answer: null as unknown,
          revision: 0,
          state: "unanswered",
          result: null as unknown,
        },
      ],
    };
    api.mockImplementation(
      async (path: string, init?: { body?: string; method?: string }) => {
        if (path === "/auth/me") return { email: "test@example.invalid" };
        if (path.startsWith("/practice/attempts/options"))
          return {
            mcq: 1,
            essay: 1,
            providers: { chatgpt: true, openai: true, deepseek: true },
          };
        if (path.startsWith("/search?q="))
          return { topics: [], notes: [{ id: "n1", title: "TCP handshake" }] };
        if (path === "/practice/attempts") return structuredClone(attempt);
        if (path.endsWith("/answer")) {
          const body = JSON.parse(init!.body!);
          const i = attempt.items.find((i) => path.includes(i.id))!;
          i.answer = body.answer;
          i.revision++;
          i.state = "answered";
          return structuredClone(attempt);
        }
        if (path.endsWith("/submit")) {
          attempt = {
            ...attempt,
            status: "completed",
            score: 9,
            correct: 1,
            items: attempt.items.map((i) => ({
              ...i,
              state: "graded",
              result: {
                score: i.type === "mcq" ? 10 : 8,
                criteria: [],
                strengths: [],
                gaps: [],
                improvements: [],
              },
            })),
          };
          return attempt;
        }
        throw new Error(`unexpected ${path}`);
      },
    );
    render(<PracticePage />);
    fireEvent.change(screen.getByPlaceholderText("Tìm ghi chú hoặc chủ đề"), {
      target: { value: "TCP" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "TCP handshake" }),
    );
    fireEvent.change(screen.getByLabelText("Trắc nghiệm"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Tự luận"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));
    expect(await screen.findByText("SYN first?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Câu tiếp" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/A\./));
    fireEvent.click(screen.getByRole("button", { name: "Câu tiếp" }));
    expect(await screen.findByText("Explain ACK")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Câu trả lời"), {
      target: { value: "Acknowledges receipt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Nộp bài" }));
    expect(await screen.findByText("Điểm: 9.0 / 10")).toBeInTheDocument();
    const call = api.mock.calls.find(([path]) => path === "/practice/attempts");
    expect(JSON.parse(call![1].body)).toMatchObject({
      noteIds: ["n1"],
      mcqCount: 1,
      essayCount: 1,
    });
  });

  it("reviews CV-generated questions without showing answers before the quiz", async () => {
    api.mockImplementation(async (path: string) => {
      if (path === "/ai-jobs") return [];
      if (path === "/practice/import-jobs")
        return {
          id: "job1",
          noteId: null,
          noteTitle: "CV",
          action: "import-document",
          provider: "chatgpt",
          status: "succeeded",
          revision: 1,
          createdAt: "2026-10-27",
          updatedAt: "2026-10-27",
        };
      if (path === "/ai-jobs/job1/result") {
        return {
          draftId: "d1",
          items: [
            {
              id: "q1",
              prompt: "From CV: SYN first?",
              choiceA: "yes",
              choiceB: "no",
              choiceC: "maybe",
              choiceD: "never",
              suggestedTopics: ["TCP"],
            },
          ],
        };
      }
      if (path.startsWith("/search?q=")) {
        return {
          topics: [{ id: "t1", name: "TCP" }],
          notes: [{ id: "n1", title: "TCP handshake" }],
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(
      <AiJobsProvider>
        <PracticePage />
      </AiJobsProvider>,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Từ CV/ }));
    expect(
      screen.getByPlaceholderText("Tìm ghi chú hoặc chủ đề"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cấp")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sinh câu hỏi" }));

    fireEvent.click(await screen.findByRole("button", { name: "Xem kết quả" }));
    expect(await screen.findByText("From CV: SYN first?")).toBeInTheDocument();
    expect(screen.queryByText(/đúng:/i)).toBeNull();
    expect(api).toHaveBeenCalledWith(
      "/practice/import-jobs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("starts a quiz from mixed notes and topics", async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith("/search?q=")) {
        return {
          topics: [{ id: "t1", name: "TCP" }],
          notes: [
            { id: "n1", title: "TCP handshake" },
            { id: "n2", title: "TLS notes" },
          ],
        };
      }
      if (path === "/practice/attempts") {
        return {
          id: "a2",
          status: "in_progress",
          provider: "chatgpt",
          score: null,
          correct: 0,
          total: 1,
          items: [
            {
              type: "mcq",
              answer: null,
              revision: 0,
              state: "unanswered",
              result: null,
              id: "q1",
              prompt: "SYN first?",
              choiceA: "yes",
              choiceB: "no",
              choiceC: "maybe",
              choiceD: "never",
            },
          ],
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<PracticePage />);

    const search = screen.getByPlaceholderText("Tìm ghi chú hoặc chủ đề");
    fireEvent.change(search, { target: { value: "TCP" } });
    fireEvent.click(
      await screen.findByRole("button", { name: "TCP handshake" }),
    );
    fireEvent.change(search, { target: { value: "TCP" } });
    fireEvent.click(await screen.findByRole("button", { name: "TLS notes" }));
    fireEvent.change(search, { target: { value: "TCP" } });
    fireEvent.click(await screen.findByRole("button", { name: "TCP" }));
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu" }));

    expect(await screen.findByText(/Câu 1 \/ 1/)).toBeInTheDocument();
    const call = api.mock.calls.find(
      ([path]) => typeof path === "string" && path === "/practice/attempts",
    );
    expect(JSON.parse(call![1].body)).toMatchObject({
      noteIds: ["n1", "n2"],
      topicIds: ["t1"],
    });
  });
});
