import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));
import { NoteChat } from "./NoteChat";
beforeEach(() => {
  api.mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  api.mockResolvedValue({ turns: [], revision: 0, pending: false });
});
afterEach(cleanup);
it("loads history for the note and sends a question without sending client note content", async () => {
  render(<NoteChat noteId="n1" title="TCP" dirty={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Hỏi về note" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Gửi câu hỏi" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Câu hỏi của bạn"), {
    target: { value: "Tại sao cần ACK?" },
  });
  api.mockResolvedValueOnce({
    turns: [
      {
        id: "r1",
        question: "Tại sao cần ACK?",
        answer: "Để **xác nhận**.",
        provider: "chatgpt",
      },
    ],
    revision: 1,
    pending: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
  expect(await screen.findByText("xác nhận")).toBeInTheDocument();
  const call = api.mock.calls.find(([, options]) => options?.method === "POST");
  expect(call![0]).toBe("/notes/n1/chat");
  expect(JSON.parse(call![1].body)).toEqual({
    message: "Tại sao cần ACK?",
    provider: "chatgpt",
    revision: 0,
    requestId: expect.any(String),
  });
  expect(screen.getByLabelText("Câu hỏi của bạn")).toHaveValue("");
});
it("keeps a failed question for retry and restores focus when closing", async () => {
  render(<NoteChat noteId="n1" title="TCP" dirty={false} />);
  const trigger = screen.getByRole("button", { name: "Hỏi về note" });
  trigger.focus();
  fireEvent.click(trigger);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Gửi câu hỏi" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Câu hỏi của bạn"), {
    target: { value: "Explain" },
  });
  api.mockRejectedValueOnce(new Error("Provider offline"));
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Provider offline",
  );
  expect(screen.getByLabelText("Câu hỏi của bạn")).toHaveValue("Explain");
  fireEvent.click(screen.getByRole("button", { name: "Đóng chat" }));
  await waitFor(() => expect(trigger).toHaveFocus());
});
it("requires saving edits before sending while still allowing history to be read", async () => {
  render(<NoteChat noteId="n1" title="TCP" dirty />);
  fireEvent.click(screen.getByRole("button", { name: "Hỏi về note" }));
  expect(
    await screen.findByText(/Lưu thay đổi trong note/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Gửi câu hỏi" })).toBeDisabled();
});

it("reconciles a completed request after its response was lost instead of resending it", async () => {
  render(<NoteChat noteId="n1" title="TCP" dirty={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Hỏi về note" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Gửi câu hỏi" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Câu hỏi của bạn"), {
    target: { value: "Explain" },
  });
  api.mockRejectedValueOnce(new Error("Network lost"));
  fireEvent.click(screen.getByRole("button", { name: "Gửi câu hỏi" }));
  await screen.findByRole("alert");
  const request = JSON.parse(
    api.mock.calls.find(([, options]) => options?.method === "POST")![1].body,
  );
  api.mockResolvedValueOnce({
    turns: [
      {
        id: request.requestId,
        question: "Explain",
        answer: "Recovered answer",
        provider: "chatgpt",
      },
    ],
    revision: 1,
    pending: false,
  });
  fireEvent.click(screen.getByRole("button", { name: "Tải lại lịch sử" }));
  expect(await screen.findByText("Recovered answer")).toBeInTheDocument();
  expect(screen.getByLabelText("Câu hỏi của bạn")).toHaveValue("");
});

it("allows recovery when polling a pending turn fails", async () => {
  vi.useFakeTimers();
  try {
    api.mockResolvedValueOnce({ turns: [], revision: 0, pending: true });
    render(<NoteChat noteId="n1" title="TCP" dirty={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Hỏi về note" }));
    await act(async () => {
      await Promise.resolve();
    });
    api.mockRejectedValueOnce(new Error("Polling offline"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Polling offline");
    const reload = screen.getByRole("button", { name: "Tải lại lịch sử" });
    expect(reload).toBeEnabled();
    api.mockResolvedValueOnce({ turns: [], revision: 0, pending: false });
    fireEvent.click(reload);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Gửi câu hỏi" })).toBeEnabled();
  } finally {
    vi.useRealTimers();
  }
});
