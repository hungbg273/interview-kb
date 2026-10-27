"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
type Publication = { id?: string; published: boolean; publishedAt?: string };
export function PublicationControls({
  noteId,
  dirty,
}: {
  noteId: string;
  dirty: boolean;
}) {
  const [publication, setPublication] = useState<Publication | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let alive = true;
    void api<Publication>(`/notes/${noteId}/publication`, {
      signal: abort.signal,
    })
      .then((value) => {
        if (alive) setPublication(value);
      })
      .catch(() => {
        if (alive) setError("Không tải được trạng thái xuất bản.");
      });
    return () => {
      alive = false;
      abort.abort();
    };
  }, [noteId]);
  async function change(publish: boolean) {
    if (busy || (publish && dirty)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api<Publication>(`/notes/${noteId}/publication`, {
        method: publish ? "POST" : "DELETE",
      });
      setPublication(next);
      setMessage(
        publish
          ? "Đã xuất bản bản chụp nội dung đã lưu."
          : "Đã gỡ ghi chú khỏi Cộng đồng.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không cập nhật được xuất bản.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="publication-controls" aria-label="Xuất bản ghi chú">
      <div>
        <strong>
          {publication?.published ? "Đã xuất bản" : "Ghi chú riêng tư"}
        </strong>
        <p>
          {publication?.published
            ? "Chỉ bản chụp đã xuất bản được chia sẻ. Sửa bản nháp không tự cập nhật bản công khai."
            : "Xuất bản để người dùng khác đọc và lưu bản sao vào thư viện của họ."}
        </p>
      </div>
      {dirty && (
        <p className="field-hint">
          Lưu thay đổi trước khi xuất bản nội dung mới.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="row">
        <button
          type="button"
          className="ghost"
          disabled={!publication || busy || dirty}
          onClick={() => void change(true)}
        >
          {busy
            ? "Đang cập nhật…"
            : publication?.published
              ? "Cập nhật bản công khai"
              : "Xuất bản ghi chú"}
        </button>
        {publication?.published && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => void change(false)}
          >
            Gỡ xuất bản
          </button>
        )}
      </div>
    </section>
  );
}
