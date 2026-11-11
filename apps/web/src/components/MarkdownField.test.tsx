import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => ({ api, API_URL: "http://localhost:4000" }));
import { MarkdownField } from "./MarkdownField";
afterEach(() => {
  cleanup();
  api.mockReset();
});
function Editor() {
  const [value, setValue] = useState("Before AFTER");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <MarkdownField
        defaultPreview={false}
        value={value}
        onChange={setValue}
        onUploadStateChange={setBusy}
      />
      <button disabled={busy}>Save</button>
    </>
  );
}
function paste(file: File) {
  const field = screen.getByRole("textbox") as HTMLTextAreaElement;
  field.focus();
  field.setSelectionRange(7, 12);
  fireEvent.paste(field, {
    clipboardData: {
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    },
  });
  return field;
}
test("inserts at the selection without losing edits typed during upload", async () => {
  let finish!: (result: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Editor />);
  const field = paste(
    new File(["png"], "clipboard.png", { type: "image/png" }),
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.change(field, { target: { value: field.value + " More text" } });
  await act(async () =>
    finish({ url: "/note-images/12345678-1234-1234-1234-123456789abc" }),
  );
  await waitFor(() =>
    expect(field.value).toContain(
      "![Ảnh dán](/note-images/12345678-1234-1234-1234-123456789abc)",
    ),
  );
  expect(field.value).toContain("Before ");
  expect(field.value).toContain(" More text");
  expect(field.value).not.toContain("AFTER");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  expect(api).toHaveBeenCalledWith(
    "/note-images",
    expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
  );
});
test("restores selected text on failure and reports an error", async () => {
  api.mockRejectedValue(new Error("Offline"));
  render(<Editor />);
  const field = paste(new File(["png"], "a.png", { type: "image/png" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(field.value).toBe("Before AFTER");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});
test("rejects unsupported images without changing the draft", async () => {
  render(<Editor />);
  const field = paste(new File(["svg"], "a.svg", { type: "image/svg+xml" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("PNG, JPEG");
  expect(field.value).toBe("Before AFTER");
  expect(api).not.toHaveBeenCalled();
});
test("does not restore an upload placeholder deleted by the user", async () => {
  let finish!: (result: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Editor />);
  const field = paste(new File(["png"], "a.png", { type: "image/png" }));
  fireEvent.change(field, { target: { value: "Replacement" } });
  await act(async () =>
    finish({ url: "/note-images/12345678-1234-1234-1234-123456789abc" }),
  );
  expect(field.value).toBe("Replacement");
});
test("leaves plain text paste to the browser", () => {
  render(<Editor />);
  const field = screen.getByRole("textbox");
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { items: [{ kind: "string", type: "text/plain" }] },
  });
  fireEvent(field, event);
  expect(event.defaultPrevented).toBe(false);
  expect(api).not.toHaveBeenCalled();
});
test("aborts pending uploads when the editor unmounts", () => {
  api.mockImplementation(() => new Promise(() => {}));
  const view = render(<Editor />);
  paste(new File(["png"], "a.png", { type: "image/png" }));
  const signal = api.mock.calls[0][1].signal as AbortSignal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});
test.each([true, false])(
  "preserves edits to whitespace next to the placeholder (success=%s)",
  async (success) => {
    let resolve!: (result: unknown) => void, reject!: (error: Error) => void;
    api.mockImplementation(
      () =>
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        }),
    );
    render(<Editor />);
    const field = paste(new File(["png"], "a.png", { type: "image/png" }));
    fireEvent.change(field, {
      target: { value: field.value.slice(0, -1) + " continued" },
    });
    await act(async () =>
      success
        ? resolve({ url: "/note-images/12345678-1234-1234-1234-123456789abc" })
        : reject(new Error("Offline")),
    );
    expect(field.value).not.toContain("image-upload-");
    expect(field.value).toContain(" continued");
    expect(field.value).toContain(success ? "![Ảnh dán]" : "AFTER");
  },
);
