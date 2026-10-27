import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { NoteWorkspace } from "./NoteWorkspace";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test("can hide and reopen the navigation and tools without losing editor content", () => {
  render(
    <NoteWorkspace
      title="TCP"
      dirty
      left={<p>Note list</p>}
      right={<p>Local graph</p>}
    >
      <textarea aria-label="Draft" defaultValue="Unsaved text" />
    </NoteWorkspace>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ẩn danh sách ghi chú" }));
  expect(
    screen.queryByRole("complementary", { name: "Danh sách ghi chú" }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Hiện danh sách ghi chú" }),
  );
  expect(
    screen.getByRole("complementary", { name: "Danh sách ghi chú" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved text");
  expect(screen.getByRole("status")).toHaveTextContent("Chưa lưu thay đổi");
});
test("Escape dismisses side panels", () => {
  render(
    <NoteWorkspace
      title="TCP"
      left={<p>Note list</p>}
      right={<p>Local graph</p>}
    >
      Editor
    </NoteWorkspace>,
  );
  fireEvent.keyDown(screen.getByRole("main"), { key: "Escape" });
  expect(
    screen.getByRole("button", { name: "Hiện danh sách ghi chú" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(
    screen.getByRole("button", { name: "Hiện đồ thị và công cụ" }),
  ).toHaveAttribute("aria-expanded", "false");
});

test("entering a narrow viewport closes overlapping panels and opens accessible tools", () => {
  let onChange: (event: { matches: boolean }) => void = () => {};
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: (_name: string, fn: typeof onChange) => {
      onChange = fn;
    },
    removeEventListener: () => {},
  }));
  render(
    <NoteWorkspace
      title="TCP"
      left={<p>Notes</p>}
      right={<button>Tool action</button>}
    >
      <input aria-label="Editor" />
    </NoteWorkspace>,
  );
  act(() => onChange({ matches: true }));
  expect(
    screen.getByRole("button", { name: "Hiện danh sách ghi chú" }),
  ).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(
    screen.getByRole("button", { name: "Hiện đồ thị và công cụ" }),
  );
  expect(
    screen.getByRole("complementary", { name: "Đồ thị và công cụ" }),
  ).toHaveFocus();
  expect(
    screen.getByRole("region", { name: "Nội dung ghi chú", hidden: true }),
  ).toHaveAttribute("inert");
  fireEvent.keyDown(screen.getByRole("main"), { key: "Escape" });
  expect(
    screen.getByRole("button", { name: "Hiện đồ thị và công cụ" }),
  ).toHaveFocus();
});
