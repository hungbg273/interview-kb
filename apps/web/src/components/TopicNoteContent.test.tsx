import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
import { TopicNoteContent } from "./TopicNoteContent";
afterEach(() => {
  cleanup();
  api.mockReset();
});
it("saves edited note content without navigating away from the topic", async () => {
  api.mockResolvedValue({});
  const onSaved = vi.fn().mockResolvedValue(undefined),
    onDirty = vi.fn();
  render(
    <TopicNoteContent
      note={{ id: "n1", title: "TCP", bodyMarkdown: "Old body" }}
      onSaved={onSaved}
      onDelete={() => {}}
      onDirtyChange={onDirty}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa TCP" }));
  fireEvent.change(screen.getByLabelText("Nội dung"), {
    target: { value: "New body" },
  });
  expect(onDirty).toHaveBeenCalledWith("n1", true);
  fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));
  expect(screen.getByLabelText("Nội dung")).toBeDisabled();
  expect(screen.getByLabelText("Tiêu đề")).toBeDisabled();
  await screen.findByRole("button", { name: "Chỉnh sửa TCP" });
  expect(api).toHaveBeenCalledWith("/notes/n1", {
    method: "PATCH",
    body: JSON.stringify({ title: "TCP", bodyMarkdown: "New body" }),
  });
  expect(onSaved).toHaveBeenCalled();
  expect(onDirty).toHaveBeenLastCalledWith("n1", false);
});
it("keeps edited text visible when saving fails", async () => {
  api.mockRejectedValue(new Error("offline"));
  render(
    <TopicNoteContent
      note={{ id: "n1", title: "TCP", bodyMarkdown: "Old body" }}
      onSaved={async () => {}}
      onDelete={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa TCP" }));
  fireEvent.change(screen.getByLabelText("Nội dung"), {
    target: { value: "Unsaved body" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu ghi chú" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Không lưu được");
  expect(screen.getByLabelText("Nội dung")).toHaveValue("Unsaved body");
});

it("previews the unsaved topic note draft without saving or leaving edit mode", async () => {
  render(
    <TopicNoteContent
      note={{ id: "n1", title: "TCP", bodyMarkdown: "Saved" }}
      onSaved={async () => {}}
      onDelete={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa TCP" }));
  fireEvent.change(screen.getByLabelText("Nội dung"), {
    target: { value: "# Draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Xem trước" }));
  expect(
    await screen.findByRole("heading", { name: "Draft" }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: /^Chỉnh sửa$/ }),
  );
  expect(screen.getByLabelText("Nội dung")).toHaveValue("# Draft");
  expect(api).not.toHaveBeenCalled();
});
