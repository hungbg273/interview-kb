"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCanNavigate } from "./WorkspaceNavigation";
type Status = {
  connected: boolean;
  email?: string;
  model?: string;
  connectionMode?: "local" | "forwarded";
  callbackPort?: number;
};
type Model = { id: string; name: string };
export function ChatgptConnectionPanel() {
  const [status, setStatus] = useState<Status | null>(null),
    [models, setModels] = useState<Model[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const canNavigate = useCanNavigate();
  const [loopbackPort, setLoopbackPort] = useState("4000");
  const load = useCallback(async () => {
    const next = await api<Status>("/chatgpt/status");
    setStatus(next);
    setLoopbackPort(String(next.callbackPort ?? 4000));
    if (next.connected) setModels(await api<Model[]>("/chatgpt/models"));
  }, []);
  useEffect(() => {
    let active = true;
    void load().catch((e) => {
      if (active) setError(e.message || "Không tải được kết nối ChatGPT.");
    });
    if (new URLSearchParams(window.location.search).get("chatgpt") === "error")
      setError(
        "Chưa kết nối được ChatGPT. Vui lòng thử lại và cấp quyền sử dụng gói.",
      );
    return () => {
      active = false;
    };
  }, [load]);
  async function connect() {
    if (!canNavigate()) return;
    setBusy(true);
    setError("");
    try {
      const forwarded = status?.connectionMode === "forwarded";
      const port = Number(loopbackPort);
      if (
        forwarded &&
        (!Number.isInteger(port) || port < 1024 || port > 65535)
      ) {
        throw new Error("Cổng kết nối phải là số nguyên từ 1024 đến 65535.");
      }
      const result = await api<{ url: string }>("/chatgpt/connect", {
        method: "POST",
        body: JSON.stringify({
          returnPath: window.location.pathname,
          ...(forwarded ? { loopbackPort: port } : {}),
        }),
      });
      window.location.assign(result.url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ revoked: boolean }>("/chatgpt/disconnect", {
        method: "POST",
      });
      setStatus((current) => ({
        ...current,
        connected: false,
        email: undefined,
        model: undefined,
      }));
      setModels([]);
      if (!result.revoked)
        setMessage(
          "Đã xóa kết nối trong app. Chưa xác nhận thu hồi quyền từ OpenAI; bạn có thể thu hồi trong cài đặt ChatGPT.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function select(model: string) {
    setBusy(true);
    setError("");
    try {
      await api("/chatgpt/model", {
        method: "POST",
        body: JSON.stringify({ model }),
      });
      setStatus((current) => (current ? { ...current, model } : current));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="chatgpt-connection">
      <p>
        {status?.connected
          ? `Đã kết nối ChatGPT${status.email ? " · " + status.email : ""}`
          : "Sử dụng hạn mức ChatGPT của chính bạn."}
      </p>
      {status?.connected ? (
        <>
          {models.length > 0 && (
            <label>
              Mô hình ChatGPT
              <select
                aria-label="Mô hình ChatGPT"
                disabled={busy}
                value={
                  status.model && models.some((m) => m.id === status.model)
                    ? status.model
                    : models[0].id
                }
                onChange={(e) => void select(e.target.value)}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            Ngắt kết nối ChatGPT
          </button>
        </>
      ) : (
        <>
          {status?.connectionMode === "forwarded" && (
            <div>
              <p>
                Khi dùng máy chủ từ xa, mở forwarding tới API trước khi tiếp
                tục. Nhập cổng local do công cụ forwarding cung cấp. Chỉ cần giữ
                kết nối này trong lúc đăng nhập hoặc kết nối lại ChatGPT.
              </p>
              <label>
                Cổng kết nối trên máy này
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  step={1}
                  value={loopbackPort}
                  disabled={busy}
                  onChange={(event) => setLoopbackPort(event.target.value)}
                />
              </label>
            </div>
          )}
          <button
            type="button"
            disabled={busy || !status}
            onClick={() => void connect()}
          >
            Tiếp tục với ChatGPT
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
