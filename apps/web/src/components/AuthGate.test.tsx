import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
}));

import { AuthGate } from "./AuthGate";
import {
  WorkspaceNavigationProvider,
  useUnsavedChanges,
} from "./WorkspaceNavigation";
function UnsavedNote() {
  useUnsavedChanges(true);
  return <p>Unsaved note</p>;
}

afterEach(() => {
  cleanup();
  replace.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body?: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: "Error",
    json: async () => body,
  };
}

describe("AuthGate", () => {
  it("redirects unauthenticated visitors to login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: "UNAUTHENTICATED", message: "missing token" },
        }),
      ),
    );

    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
  });

  it("renders children and the user email when the session is valid", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { email: "you@example.com" })),
    );

    render(
      <AuthGate>
        <p>Danh sách sẽ có ở bước 11.</p>
      </AuthGate>,
    );

    expect(await screen.findByText("you@example.com")).toBeInTheDocument();
    expect(screen.getByText("Danh sách sẽ có ở bước 11.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ghi chú" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Luyện tập" })).toHaveAttribute(
      "href",
      "/practice",
    );
    expect(screen.getByRole('link', { name: 'Phỏng vấn thử' })).toHaveAttribute('href', '/interview');
    expect(
      screen.queryByRole("link", { name: "Chủ đề" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the authenticated shell mounted when page content changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { email: "you@example.com" }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <AuthGate>
        <p>First note</p>
      </AuthGate>,
    );
    await screen.findByText("you@example.com");
    const shell = screen.getByRole("navigation", { name: "Điều hướng chính" });
    rerender(
      <AuthGate>
        <p>Second note</p>
      </AuthGate>,
    );
    expect(screen.getByRole("navigation", { name: "Điều hướng chính" })).toBe(
      shell,
    );
    expect(screen.getByText("Second note")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("confirms before logging out with unsaved changes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { email: "you@example.com" }));
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <WorkspaceNavigationProvider>
        <AuthGate>
          <UnsavedNote />
        </AuthGate>
      </WorkspaceNavigationProvider>,
    );
    await screen.findByText("Unsaved note");
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("logs out then returns to login", async () => {
    const noContent = {
      status: 204,
      ok: true,
      json: async () => {
        throw new Error("no body");
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(noContent)
      .mockResolvedValueOnce(jsonResponse(200, { email: "you@example.com" }))
      .mockResolvedValueOnce(noContent);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    );

    await screen.findByText("you@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        "http://localhost:4000/auth/logout",
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
    expect(replace).toHaveBeenCalledWith("/login");
  });
});

it("clears cached private workspace state when the account changes in another tab", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, { email: "alice@example.com" }))
    .mockResolvedValue(jsonResponse(200, { email: "bob@example.com" }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <AuthGate>
      <input aria-label="Local draft" defaultValue="" />
    </AuthGate>,
  );
  await screen.findByText("alice@example.com");
  fireEvent.change(screen.getByLabelText("Local draft"), {
    target: { value: "Alice private draft" },
  });
  fireEvent.focus(window);
  await screen.findByText("bob@example.com");
  expect(screen.getByLabelText("Local draft")).toHaveValue("");
  expect(screen.queryByText("alice@example.com")).toBeNull();
});

it("loads the initial authenticated workspace even in a background tab", async () => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { email: "alice@example.com" })),
  );
  render(
    <AuthGate>
      <p>Private workspace</p>
    </AuthGate>,
  );
  expect(await screen.findByText("Private workspace")).toBeInTheDocument();
});
it("keeps the current draft on transient session-check network failure", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(200, { email: "alice@example.com" }))
    .mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <AuthGate>
      <input aria-label="Local draft" defaultValue="" />
    </AuthGate>,
  );
  await screen.findByText("alice@example.com");
  fireEvent.change(screen.getByLabelText("Local draft"), {
    target: { value: "Unsaved" },
  });
  fireEvent.focus(window);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Local draft")).toHaveValue("Unsaved");
  expect(replace).not.toHaveBeenCalled();
});
