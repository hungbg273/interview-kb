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
