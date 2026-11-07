import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ChatgptConnectionPanel } from "./ChatgptConnectionPanel";
const { api, canNavigate } = vi.hoisted(() => ({
  api: vi.fn(),
  canNavigate: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api }));
vi.mock("./WorkspaceNavigation", () => ({ useCanNavigate: () => canNavigate }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
test("uses account catalog and persists the selected model", async () => {
  api
    .mockResolvedValueOnce({
      connected: true,
      email: "person@example.com",
      model: "a",
    })
    .mockResolvedValueOnce([
      { id: "a", name: "Model A" },
      { id: "b", name: "Model B" },
    ])
    .mockResolvedValueOnce({ model: "b" });
  render(<ChatgptConnectionPanel />);
  const select = await screen.findByRole("combobox", {
    name: "Mô hình ChatGPT",
  });
  fireEvent.change(select, { target: { value: "b" } });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/chatgpt/model", {
      method: "POST",
      body: JSON.stringify({ model: "b" }),
    }),
  );
  expect(screen.getByText(/person@example.com/)).toBeTruthy();
});
test("honors unsaved navigation guard before OAuth", async () => {
  api.mockResolvedValue({ connected: false });
  canNavigate.mockReturnValue(false);
  render(<ChatgptConnectionPanel />);
  const button = await screen.findByRole("button", {
    name: "Tiếp tục với ChatGPT",
  });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  expect(canNavigate).toHaveBeenCalled();
  expect(api).toHaveBeenCalledTimes(1);
});
test("displays unconfirmed remote revocation and clears account locally", async () => {
  api
    .mockResolvedValueOnce({ connected: true, email: "person@example.com" })
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ revoked: false });
  render(<ChatgptConnectionPanel />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Ngắt kết nối ChatGPT" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Chưa xác nhận thu hồi quyền",
  );
  expect(screen.queryByText(/person@example.com/)).toBeNull();
});

test("uses the fixed connector port without asking the user for a port", async () => {
  api
    .mockResolvedValueOnce({
      connected: false,
      connectionMode: "forwarded",
      callbackPort: 4000,
    })
    .mockRejectedValueOnce(new Error("Test stops before browser navigation"));
  canNavigate.mockReturnValue(true);
  render(<ChatgptConnectionPanel />);
  expect(
    await screen.findByText("npm run chatgpt:connect"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục với ChatGPT" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("/chatgpt/connect", {
      method: "POST",
      body: JSON.stringify({
        returnPath: window.location.pathname,
        loopbackPort: 18080,
      }),
    }),
  );
});

test("keeps connector instructions when a hosted account disconnects", async () => {
  api
    .mockResolvedValueOnce({
      connected: true,
      connectionMode: "forwarded",
      email: "person@example.com",
    })
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce({ revoked: true });
  render(<ChatgptConnectionPanel />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Ngắt kết nối ChatGPT" }),
  );
  expect(
    await screen.findByText("npm run chatgpt:connect"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

test("keeps local connections free of forwarding requirements", async () => {
  api.mockResolvedValue({
    connected: false,
    connectionMode: "local",
    callbackPort: 4000,
  });
  render(<ChatgptConnectionPanel />);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Tiếp tục với ChatGPT" }),
    ).not.toBeDisabled(),
  );
  expect(screen.queryByRole("spinbutton")).toBeNull();
});
