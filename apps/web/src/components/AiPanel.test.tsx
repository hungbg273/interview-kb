import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AiPanel } from "./AiPanel";

afterEach(() => {
  cleanup();
});

test("shows retry on error", () => {
  render(
    <AiPanel
      error="AI request timed out"
      preview=""
      provider="openai"
      lastRun={{ action: "summarize" }}
      questionCount={5}
      questionLang="vi"
      difficulty="medium"
      onQuestionCountChange={() => {}}
      onDifficultyChange={() => {}}
      onQuestionLangChange={() => {}}
      onProviderChange={() => {}}
      onRun={() => {}}
      onApply={() => {}}
      onDiscard={() => {}}
    />,
  );
  expect(screen.getByText("AI request timed out")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
});

test("can pick question count and run new AI actions", () => {
  const onRun = vi.fn();
  const onCount = vi.fn();
  const onDifficulty = vi.fn();
  render(
    <AiPanel
      error=""
      preview=""
      provider="openai"
      lastRun={{ action: "summarize" }}
      questionCount={5}
      questionLang="vi"
      difficulty="medium"
      onQuestionCountChange={onCount}
      onDifficultyChange={onDifficulty}
      onQuestionLangChange={() => {}}
      onProviderChange={() => {}}
      onRun={onRun}
      onApply={() => {}}
      onDiscard={() => {}}
    />,
  );

  fireEvent.change(screen.getByLabelText("Số câu"), { target: { value: "3" } });
  expect(onCount).toHaveBeenCalledWith(3);

  fireEvent.click(screen.getByRole("button", { name: "Soạn nội dung" }));
  expect(onRun).toHaveBeenCalledWith({ action: "generate-content" });

  fireEvent.click(screen.getByRole("button", { name: "Sinh câu hỏi" }));
  expect(onRun).toHaveBeenCalledWith({
    action: "generate-questions",
    count: 5,
    difficulty: "medium",
    targetLang: "vi",
  });

  fireEvent.change(screen.getByLabelText("Độ khó"), {
    target: { value: "hard" },
  });
  expect(onDifficulty).toHaveBeenCalledWith("hard");

  fireEvent.click(screen.getByRole("button", { name: "Dịch ghi chú → Việt" }));
  expect(onRun).toHaveBeenCalledWith({
    action: "translate-note",
    targetLang: "vi",
  });

  fireEvent.click(
    screen.getByRole("button", { name: "Dịch ghi chú → English" }),
  );
  expect(onRun).toHaveBeenCalledWith({
    action: "translate-note",
    targetLang: "en",
  });

  expect(
    screen.queryByRole("button", { name: "Dịch câu hỏi → Việt" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Dịch câu hỏi → English" }),
  ).toBeNull();
});

test("announces progress and prevents duplicate actions while AI is running", () => {
  const onRun = vi.fn();
  render(
    <AiPanel
      busy
      provider="openai"
      lastRun={{ action: "summarize" }}
      questionCount={5}
      questionLang="vi"
      difficulty="medium"
      onQuestionCountChange={() => {}}
      onQuestionLangChange={() => {}}
      onDifficultyChange={() => {}}
      onProviderChange={() => {}}
      preview=""
      error=""
      onRun={onRun}
      onApply={() => {}}
      onDiscard={() => {}}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("AI đang xử lý");
  expect(screen.getByRole("button", { name: "Tóm tắt" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Tóm tắt" }));
  expect(onRun).not.toHaveBeenCalled();
});

test("reveals the preview before AI controls and scrolls it into view", () => {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  render(
    <AiPanel
      provider="openai"
      lastRun={{ action: "summarize" }}
      questionCount={5}
      questionLang="vi"
      difficulty="medium"
      onQuestionCountChange={() => {}}
      onQuestionLangChange={() => {}}
      onDifficultyChange={() => {}}
      onProviderChange={() => {}}
      preview="Nội dung kết quả"
      error=""
      onRun={() => {}}
      onApply={() => {}}
      onDiscard={() => {}}
    />,
  );
  const preview = screen.getByRole("region", { name: "Kết quả AI" });
  expect(preview.textContent).toContain("Nội dung kết quả");
  expect(
    preview.compareDocumentPosition(screen.getByLabelText("Nguồn AI")) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(scrollIntoView).toHaveBeenCalled();
});
