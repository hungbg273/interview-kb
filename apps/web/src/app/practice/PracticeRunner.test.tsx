import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PracticeRunner } from "./PracticeRunner";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
afterEach(() => {
  cleanup();
  api.mockReset();
});
const item = {
  id: "i",
  type: "essay" as const,
  prompt: "Explain transactions",
  answer: null,
  revision: 0,
  state: "unanswered" as const,
  result: null,
};
const attempt = {
  id: "a",
  status: "in_progress" as const,
  provider: "openai" as const,
  items: [item],
  score: null,
  correct: 0,
  total: 1,
};
it("submits the visible essay for individual grading and locks successful answers", async () => {
  api.mockResolvedValue({
    ...attempt,
    items: [
      {
        ...item,
        state: "graded",
        answer: { type: "essay", text: "Atomic changes" },
        result: {
          score: 8,
          criteria: [],
          strengths: [],
          gaps: [],
          improvements: [],
        },
      },
    ],
  });
  render(<PracticeRunner initial={attempt} onExit={() => {}} />);
  fireEvent.change(screen.getByLabelText("Câu trả lời"), {
    target: { value: "Atomic changes" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Chấm câu này" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Câu trả lời")).toBeDisabled(),
  );
  expect(JSON.parse(api.mock.calls[0][1].body).answer).toEqual({
    type: "essay",
    text: "Atomic changes",
  });
  expect(screen.getByText(/Đã chấm/)).toBeInTheDocument();
});
it("keeps the typed answer after a failed save", async () => {
  api.mockRejectedValue(new Error("Save failed"));
  render(<PracticeRunner initial={attempt} onExit={() => {}} />);
  fireEvent.change(screen.getByLabelText("Câu trả lời"), {
    target: { value: "Keep me" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Nộp bài" }));
  expect(await screen.findByText("Save failed")).toBeInTheDocument();
  expect(screen.getByLabelText("Câu trả lời")).toHaveValue("Keep me");
});
