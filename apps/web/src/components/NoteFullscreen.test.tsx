import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarkdownField } from "./MarkdownField";
import { TopicNoteContent } from "./TopicNoteContent";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(cleanup);

it("opens the current draft for reading and closes without changing the editor", () => {
  const onChange = vi.fn();
  render(
    <MarkdownField
      value="# Unsaved draft"
      onChange={onChange}
      defaultPreview={false}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Toàn màn hình" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("heading", { name: "Unsaved draft" }),
  ).toBeInTheDocument();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Thoát toàn màn hình" }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Nội dung")).toHaveValue("# Unsaved draft");
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe("");
  expect(onChange).not.toHaveBeenCalled();
});

it("reads a topic note and restores scrolling on Escape", () => {
  render(
    <TopicNoteContent
      note={{ id: "n1", title: "TCP", bodyMarkdown: "Note body" }}
      onSaved={async () => {}}
      onDelete={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Toàn màn hình" }));
  const dialog = screen.getByRole("dialog", { name: "TCP" });
  expect(within(dialog).getByText("Note body")).toBeInTheDocument();
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
});
