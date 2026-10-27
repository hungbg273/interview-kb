import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
import { PublicationControls } from "./PublicationControls";
afterEach(() => {
  cleanup();
  api.mockReset();
});
test("requires a saved draft before explicitly publishing a snapshot", async () => {
  api.mockResolvedValue({ published: false });
  const view = render(<PublicationControls noteId="n1" dirty />);
  expect(
    await screen.findByRole("button", { name: "Xuất bản ghi chú" }),
  ).toBeDisabled();
  view.rerender(<PublicationControls noteId="n1" dirty={false} />);
  api.mockResolvedValue({ id: "p1", published: true });
  fireEvent.click(screen.getByRole("button", { name: "Xuất bản ghi chú" }));
  expect(
    await screen.findByRole("button", { name: "Gỡ xuất bản" }),
  ).toBeInTheDocument();
  expect(api).toHaveBeenCalledWith("/notes/n1/publication", { method: "POST" });
});
