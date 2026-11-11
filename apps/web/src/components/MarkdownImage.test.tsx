import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";
const path = "/note-images/12345678-1234-1234-1234-123456789abc";
const create = vi.fn(() => "blob:private-image"),
  revoke = vi.fn();
beforeEach(() => {
  class TestURL extends URL {
    static createObjectURL = create;
    static revokeObjectURL = revoke;
  }
  vi.stubGlobal("URL", TestURL);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  create.mockClear();
  revoke.mockClear();
});
test("loads managed images with credentials, retains alt text and releases blob URLs", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["png"], { type: "image/png" }),
    });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<MarkdownPreview markdown={`![Sơ đồ mạng](${path})`} />);
  const image = await screen.findByRole("img", { name: "Sơ đồ mạng" });
  expect(image).toHaveAttribute("src", "blob:private-image");
  expect(image).toHaveClass("markdown-image");
  expect(fetcher).toHaveBeenCalledWith(
    "http://localhost:4000" + path,
    expect.objectContaining({ credentials: "include" }),
  );
  view.unmount();
  expect(revoke).toHaveBeenCalledWith("blob:private-image");
});
test("does not forward API credentials to external image URLs", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(
    <MarkdownPreview markdown="![External](https://example.com/photo.png)" />,
  );
  expect(screen.getByRole("img", { name: "External" })).toHaveAttribute(
    "src",
    "https://example.com/photo.png",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
test("offers retry after an image fetch fails", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, blob: async () => new Blob(["png"]) });
  vi.stubGlobal("fetch", fetcher);
  render(<MarkdownPreview markdown={`![Diagram](${path})`} />);
  fireEvent.click(await screen.findByRole("button", { name: "Tải lại ảnh" }));
  expect(
    await screen.findByRole("img", { name: "Diagram" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});
