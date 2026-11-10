import { render, screen, cleanup } from "@testing-library/react";
import { expect, test, afterEach } from "vitest";
import { QuestionForm } from "./QuestionForm";

afterEach(cleanup);

test("has A-D radios", () => {
  render(
    <QuestionForm
      value={{
        prompt: "",
        choiceA: "",
        choiceB: "",
        choiceC: "",
        choiceD: "",
        correctChoice: "A",
        explanationMarkdown: "",
        lang: "vi",
      }}
      onChange={() => {}}
      onSubmit={() => {}}
    />,
  );
  expect(screen.getByLabelText("Câu hỏi")).toBeTruthy();
  expect(screen.getByLabelText("Giải thích (tuỳ chọn)")).toBeTruthy();
  expect(screen.getByRole("group", { name: "Các đáp án" })).toBeTruthy();
  expect(screen.getByLabelText("A")).toBeTruthy();
  expect(screen.getByLabelText("D")).toBeTruthy();
});

test("shows reference and criterion controls for essays instead of choices", () => {
  render(
    <QuestionForm
      value={{
        type: "essay",
        prompt: "Explain",
        referenceAnswer: "Reference",
        rubric: [{ id: "a", description: "Accuracy", maxPoints: 10 }],
      }}
      onChange={() => {}}
      onSubmit={() => {}}
    />,
  );
  expect(screen.getByLabelText("Đáp án tham khảo")).toHaveValue("Reference");
  expect(screen.getByLabelText("Tiêu chí 1")).toHaveValue("Accuracy");
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});
