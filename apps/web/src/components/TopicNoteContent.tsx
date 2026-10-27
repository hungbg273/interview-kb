"use client";

import { WorkspaceLink } from "./WorkspaceNavigation";

import { MarkdownField } from "./MarkdownField";
import { MarkdownPreview } from "./MarkdownPreview";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type ContentNote = { id: string; title: string; bodyMarkdown?: string };

export function TopicNoteContent({
  note,
  onSaved,
  onDelete,
  onDirtyChange,
}: {
  note: ContentNote;
  onSaved: () => Promise<void>;
  onDelete: () => void;
  onDirtyChange?: (id: string, dirty: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.bodyMarkdown ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setTitle(note.title);
    setBody(note.bodyMarkdown ?? "");
  }, [note.title, note.bodyMarkdown]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/notes/${note.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title, bodyMarkdown: body }),
      });
      await onSaved();
      setEditing(false);
      onDirtyChange?.(note.id, false);
    } catch {
      setError("Không lưu được ghi chú. Nội dung chỉnh sửa vẫn được giữ.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="topic-note">
      {editing ? (
        <>
          <label>
            Tiêu đề
            <input
              disabled={busy}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                onDirtyChange?.(note.id, true);
              }}
            />
          </label>
          <MarkdownField
            defaultPreview={false}
            disabled={busy}
            className="topic-note-pad"
            value={body}
            onChange={(value) => {
              setBody(value);
              onDirtyChange?.(note.id, true);
            }}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row">
            <button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? "Đang lưu…" : "Lưu ghi chú"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                onDirtyChange?.(note.id, false);
                setTitle(note.title);
                setBody(note.bodyMarkdown ?? "");
                setError("");
              }}
            >
              Hủy
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="topic-note-title">
            <WorkspaceLink href={`/notes/${note.id}`}>
              {note.title || "Không tiêu đề"}
            </WorkspaceLink>
          </h2>
          <div className="markdown-content">
            {note.bodyMarkdown ? (
              <MarkdownPreview markdown={note.bodyMarkdown} />
            ) : (
              <p className="muted">Ghi chú chưa có nội dung.</p>
            )}
          </div>
          <div className="note-content-actions">
            <button
              type="button"
              className="ghost"
              aria-label={`Chỉnh sửa ${note.title}`}
              onClick={() => setEditing(true)}
            >
              Chỉnh sửa
            </button>
            <WorkspaceLink href={`/notes/${note.id}`}>
              Câu hỏi & AI
            </WorkspaceLink>
            <button
              type="button"
              className="ghost"
              aria-label={`Xóa ${note.title}`}
              onClick={onDelete}
            >
              Xóa
            </button>
          </div>
        </>
      )}
    </article>
  );
}
