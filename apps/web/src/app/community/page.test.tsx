import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
import CommunityPage from "./page";
afterEach(() => {
  cleanup();
  api.mockReset();
});
test("previews a published note and saves a private clone into an owned topic", async () => {
  api.mockImplementation(async (path: string, options?: RequestInit) => {
    if (path.startsWith("/community/notes?page="))
      return {
        items: [
          {
            id: "p1",
            title: "Public note",
            author: "Alice",
            publishedAt: "2026-10-27T00:00:00Z",
            saved: false,
          },
        ],
        hasMore: false,
      };
    if (path === "/topics/catalog") return [{ id: "t1", name: "My topic" }];
    if (path === "/community/notes/p1/clone") return { id: "clone1" };
    if (path === "/community/notes/p1")
      return {
        id: "p1",
        title: "Public note",
        bodyMarkdown: "# Published content",
        author: "Alice",
        publishedAt: "2026-10-27T00:00:00Z",
        saved: false,
      };
    throw new Error(path);
  });
  render(<CommunityPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Public note/ }));
  expect(
    await screen.findByRole("heading", { name: "Published content" }),
  ).toBeInTheDocument();
  await screen.findByRole("option", { name: "My topic" });
  fireEvent.change(screen.getByLabelText("Lưu vào chủ đề"), {
    target: { value: "t1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lưu vào thư viện" }));
  expect(
    await screen.findByRole("link", { name: "Mở bản sao của bạn" }),
  ).toHaveAttribute("href", "/notes/clone1");
  expect(api).toHaveBeenCalledWith(
    "/community/notes/p1/clone",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ topicId: "t1" }),
    }),
  );
  expect(screen.queryByRole("textbox", { name: "Nội dung" })).toBeNull();
});
test("shows an empty feed clearly", async () => {
  api.mockImplementation(async (path) =>
    path === "/topics/catalog" ? [] : { items: [], hasMore: false },
  );
  render(<CommunityPage />);
  expect(
    await screen.findByText("Chưa có ghi chú công khai từ người khác."),
  ).toBeInTheDocument();
});
