import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NoteEditor } from "./NoteEditor";

afterEach(() => {
  cleanup();
});

test("Save button is present", () => {
  render(
    <NoteEditor
      title="T"
      bodyMarkdown="# hi"
      onTitleChange={() => {}}
      onBodyChange={() => {}}
      onSave={() => {}}
      error=""
    />,
  );
  expect(screen.getByRole("button", { name: "Lưu" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Xem trước" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("heading", { name: "hi" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Nội dung" })).toBeNull();
});

test("shows subject chips under the title", () => {
  render(
    <NoteEditor
      title="T"
      bodyMarkdown=""
      onTitleChange={() => {}}
      onBodyChange={() => {}}
      onSave={() => {}}
      topics={[{ id: "tcp", name: "TCP" }]}
      topicQuery=""
      topicHits={[]}
      onTopicQueryChange={() => {}}
      onAddTopic={() => {}}
      onRemoveTopic={() => {}}
    />,
  );
  expect(screen.getByText("TCP")).toBeTruthy();
  expect(screen.getByPlaceholderText("+ Chủ đề")).toBeTruthy();
});

test("announces a successful save without blocking editing", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <NoteEditor
      title="T"
      bodyMarkdown=""
      onTitleChange={() => {}}
      onBodyChange={() => {}}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  expect(
    await screen.findByText("Đã lưu"),
  ).toBeInTheDocument();
});

test("does not announce a failed save or acknowledge it", async () => {
  const ack = vi.fn();
  render(<NoteEditor title="T" bodyMarkdown="" onTitleChange={() => {}} onBodyChange={() => {}} onSave={async () => false} onSavedAck={ack} />);
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Lưu" })).toBeEnabled());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Đã lưu")).toBeNull();
  expect(ack).not.toHaveBeenCalled();
});

test("acknowledges successful creation immediately and keeps focus", async () => {
  const ack = vi.fn();
  render(<NoteEditor title="T" bodyMarkdown="" onTitleChange={() => {}} onBodyChange={() => {}} onSave={async () => true} onSavedAck={ack} />);
  const save = screen.getByRole("button", { name: "Lưu" });
  save.focus(); fireEvent.click(save);
  await vi.waitFor(() => expect(ack).toHaveBeenCalledOnce());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(save).toHaveFocus();
});

test("previews the unsaved draft and preserves it when returning to edit", async () => {
  const { useState } = await import("react");
  const save = vi.fn();
  function Draft() {
    const [body, setBody] = useState("Old");
    return (
      <NoteEditor
        title="Title"
        bodyMarkdown={body}
        onBodyChange={setBody}
        onTitleChange={() => {}}
        onSave={save}
      />
    );
  }
  render(<Draft />);
  fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
  fireEvent.change(screen.getByLabelText("Nội dung"), {
    target: { value: "# Unsaved draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Xem trước" }));
  expect(
    await screen.findByRole("heading", { name: "Unsaved draft" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Nội dung" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
  expect(screen.getByLabelText("Nội dung")).toHaveValue("# Unsaved draft");
  expect(save).not.toHaveBeenCalled();
});
