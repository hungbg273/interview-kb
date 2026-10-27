import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { api, push, replace } = vi.hoisted(() => ({
  api: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api, ApiError: class extends Error {} }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "n1" }),
  useRouter: () => ({ push, replace }),
}));
import NotePage from "./page";
import { NotesProvider } from "@/components/NotesProvider";
afterEach(() => {
  cleanup();
  api.mockReset();
});
it("reloads saved note data and the sidebar list without replacing the document", async () => {
  let saved = false;
  api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === "/notes/n1" && options?.method === "PATCH") {
      saved = true;
      return {};
    }
    if (path === "/notes/n1")
      return {
        title: saved ? "NEW TITLE" : "Old title",
        bodyMarkdown: "Body",
        topics: [],
        questions: [],
      };
    if (path === "/notes")
      return {
        items: [{ id: "n1", title: saved ? "NEW TITLE" : "Old title" }],
      };
    throw new Error(path);
  });
  render(
    <NotesProvider>
      <NotePage />
    </NotesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Old title"),
  );
  fireEvent.change(screen.getByLabelText("Tiêu đề"), {
    target: { value: "New title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
  await screen.findByRole("dialog", { name: "Đã lưu" });
  expect(screen.getByLabelText("Tiêu đề")).toHaveValue("NEW TITLE");
  expect(screen.getByRole("link", { name: "NEW TITLE" })).toBeInTheDocument();
  expect(
    api.mock.calls.filter(
      ([path, options]) => path === "/notes/n1" && !options,
    ),
  ).toHaveLength(2);
});
it("preserves unsaved note edits when the question list refreshes", async () => {
  api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path === "/notes/n1")
      return {
        title: "Saved title",
        bodyMarkdown: "Saved body",
        topics: [],
        questions: options
          ? []
          : [{ id: "q1", prompt: "Question", correctChoice: "A", lang: "vi" }],
      };
    if (path === "/notes")
      return { items: [{ id: "n1", title: "Saved title" }] };
    if (path === "/questions/q1" && options?.method === "DELETE") return {};
    throw new Error(path);
  });
  render(
    <NotesProvider>
      <NotePage />
    </NotesProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Saved title"),
  );
  fireEvent.change(screen.getByLabelText("Tiêu đề"), {
    target: { value: "Unsaved title" },
  });
  fireEvent.change(screen.getByLabelText("Nội dung"), {
    target: { value: "Unsaved body" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
  await waitFor(() =>
    expect(
      api.mock.calls.filter(
        ([path, options]) => path === "/notes/n1" && !options,
      ),
    ).toHaveLength(2),
  );
  expect(screen.getByLabelText("Tiêu đề")).toHaveValue("Unsaved title");
  expect(screen.getByLabelText("Nội dung")).toHaveValue("Unsaved body");
});
