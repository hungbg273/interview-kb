import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AiJobsProvider, useAiJobs } from "./AiJobsProvider";
import type { AiJobView } from "@kb/shared";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api,
  API_URL: "http://localhost:4000",
  ApiError: class extends Error {
    status = 500;
  },
}));
class FakeSource {
  static current: FakeSource;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listener: ((event: { data: string }) => void) | null = null;
  constructor(
    public url: string,
    public options: unknown,
  ) {
    FakeSource.current = this;
  }
  addEventListener(_event: string, listener: typeof this.listener) {
    this.listener = listener;
  }
  close() {
    this.closed = true;
  }
  emit(job: AiJobView) {
    this.listener?.({ data: JSON.stringify(job) });
  }
}
const queued = {
  id: "job1",
  noteId: "n1",
  noteTitle: "TCP",
  action: "summarize",
  provider: "chatgpt",
  status: "queued",
  stage: "waiting",
  revision: 1,
  attempts: 0,
  createdAt: "2026-10-27T01:00:00Z",
  updatedAt: "2026-10-27T01:00:00Z",
  expiresAt: "2026-10-27T01:05:00Z",
  error: null,
} as AiJobView;
function Harness() {
  const { jobs, submit } = useAiJobs();
  return (
    <>
      <button
        onClick={() =>
          void submit("n1", { action: "summarize", provider: "chatgpt" }).catch(
            () => {},
          )
        }
      >
        Send
      </button>
      <p data-testid="job-state">{jobs[0]?.status}</p>
    </>
  );
}
afterEach(() => {
  cleanup();
  api.mockReset();
  vi.unstubAllGlobals();
});
test("receives completion through one authenticated stream and ignores stale events", async () => {
  vi.stubGlobal("EventSource", FakeSource);
  api.mockResolvedValueOnce([]).mockResolvedValueOnce(queued);
  render(
    <AiJobsProvider>
      <Harness />
    </AiJobsProvider>,
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/ai-jobs", expect.anything()),
  );
  fireEvent.click(screen.getByText("Send"));
  await waitFor(() =>
    expect(screen.getByTestId("job-state")).toHaveTextContent("queued"),
  );
  expect(FakeSource.current.options).toEqual({ withCredentials: true });
  act(() =>
    FakeSource.current.emit({ ...queued, status: "succeeded", revision: 3 }),
  );
  expect(screen.getByTestId("job-state")).toHaveTextContent("succeeded");
  expect(screen.getByText(/AI đã xử lý xong/)).toBeVisible();
  const style = document.createElement("style");
  style.textContent = readFileSync("src/app/workspace.css", "utf8");
  document.head.appendChild(style);
  try {
    expect(
      getComputedStyle(screen.getByRole("button", { name: "Mở kết quả" }))
        .position,
    ).not.toBe("absolute");
    expect(
      getComputedStyle(
        screen.getByRole("button", { name: "Đóng thông báo TCP" }),
      ).position,
    ).toBe("absolute");
  } finally {
    style.remove();
  }

  act(() =>
    FakeSource.current.emit({ ...queued, status: "running", revision: 2 }),
  );
  expect(screen.getByTestId("job-state")).toHaveTextContent("succeeded");
  cleanup();
  expect(FakeSource.current.closed).toBe(true);
});
test("reuses the idempotency key when the submit response is lost", async () => {
  vi.stubGlobal("EventSource", FakeSource);
  api
    .mockResolvedValueOnce([])
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(queued);
  render(
    <AiJobsProvider>
      <Harness />
    </AiJobsProvider>,
  );
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByText("Send"));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByText("Send"));
  await waitFor(() =>
    expect(screen.getByTestId("job-state")).toHaveTextContent("queued"),
  );
  expect(api.mock.calls[1][1].headers["Idempotency-Key"]).toBe(
    api.mock.calls[2][1].headers["Idempotency-Key"],
  );
});

test("opens an old job directly in a modal without navigating", async () => {
  vi.stubGlobal("EventSource", FakeSource);
  api
    .mockResolvedValueOnce([{ ...queued, status: "succeeded" }])
    .mockResolvedValueOnce({ markdown: "Kết quả cũ", sourceHash: "hash" });
  render(
    <AiJobsProvider>
      <Harness />
    </AiJobsProvider>,
  );
  await screen.findByText("Yêu cầu AI gần đây");
  fireEvent.click(screen.getByText("TCP"));
  expect(
    await screen.findByRole("dialog", { name: "Kết quả AI" }),
  ).toBeInTheDocument();
  expect(await screen.findByText("Kết quả cũ")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /TCP/ })).toBeNull();
});

test("does not overwrite unsaved edits when applying from the modal", async () => {
  vi.stubGlobal("EventSource", FakeSource);
  api.mockImplementation(async (path: string) =>
    path === "/ai-jobs"
      ? [{ ...queued, status: "succeeded" }]
      : { markdown: "Preview", sourceHash: "hash" },
  );
  const { WorkspaceNavigationProvider, useUnsavedChanges } =
    await import("./WorkspaceNavigation");
  function Dirty() {
    useUnsavedChanges(true);
    return null;
  }
  render(
    <WorkspaceNavigationProvider>
      <AiJobsProvider>
        <Dirty />
      </AiJobsProvider>
    </WorkspaceNavigationProvider>,
  );
  fireEvent.click(await screen.findByText("TCP"));
  fireEvent.click(
    await screen.findByRole("button", { name: "Áp dụng vào ghi chú" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "thay đổi chưa lưu",
  );
  expect(api.mock.calls.some(([path]) => path.endsWith("/apply"))).toBe(false);
});
