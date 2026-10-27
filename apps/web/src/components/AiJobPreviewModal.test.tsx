import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { AiJobView } from "@kb/shared";
const { api, renderDiagram } = vi.hoisted(() => ({
  api: vi.fn(),
  renderDiagram: vi.fn(),
}));
vi.mock("@/lib/load-mermaid", () => ({
  loadMermaid: async () => ({ initialize: vi.fn(), render: renderDiagram }),
}));
vi.mock("@/lib/api", () => ({ api }));
import { AiJobPreviewModal } from "./AiJobPreviewModal";
const job = {
  id: "j1",
  noteId: "n1",
  noteTitle: "TCP",
  action: "summarize",
  status: "succeeded",
} as AiJobView;
afterEach(() => {
  cleanup();
  api.mockReset();
});
test("loads a completed previous job and applies only on explicit click", async () => {
  api
    .mockResolvedValueOnce({ markdown: "# TCP", sourceHash: "hash" })
    .mockResolvedValueOnce({});
  const applied = vi.fn();
  render(
    <AiJobPreviewModal
      job={job}
      onClose={() => {}}
      onApply={async () => {
        await api("/ai-jobs/j1/apply", { method: "POST" });
        applied();
      }}
    />,
  );
  expect(
    screen.getByRole("dialog", { name: "Kết quả AI" }),
  ).toBeInTheDocument();
  await screen.findByRole("heading", { name: "TCP", level: 1 });
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Áp dụng vào ghi chú" }));
  await waitFor(() => expect(applied).toHaveBeenCalledOnce());
});
test("shows result retrieval errors instead of an empty preview", async () => {
  api.mockRejectedValue(new Error("Kết quả đã hết hạn"));
  render(
    <AiJobPreviewModal job={job} onClose={() => {}} onApply={async () => {}} />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Kết quả đã hết hạn",
  );
});
test("closes with Escape and restores focus to the opener", () => {
  const close = vi.fn();
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const view = render(
    <AiJobPreviewModal
      job={{ ...job, status: "queued" }}
      onClose={close}
      onApply={async () => {}}
    />,
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  view.unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

test("allows dismissal while apply is pending", async () => {
  api.mockResolvedValue({ markdown: "Preview", sourceHash: "hash" });
  const close = vi.fn();
  render(
    <AiJobPreviewModal
      job={job}
      onClose={close}
      onApply={() => new Promise(() => {})}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Áp dụng vào ghi chú" }),
  );
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
});

test("shows rendered Markdown and Mermaid without a source editor", async () => {
  renderDiagram.mockResolvedValue({ svg: "<svg><text>Queue</text></svg>" });
  api.mockResolvedValue({
    markdown: "# Result\n\n```mermaid\nflowchart LR\n A-->B\n```",
    sourceHash: "hash",
  });
  render(
    <AiJobPreviewModal job={job} onClose={() => {}} onApply={async () => {}} />,
  );
  expect(
    await screen.findByRole("heading", { name: "Result" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("img", { name: "Sơ đồ Mermaid" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByText("flowchart LR")).toBeNull();
});
