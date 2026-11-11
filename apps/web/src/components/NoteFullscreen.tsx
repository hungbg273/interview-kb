"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownPreview } from "./MarkdownPreview";
import { NoteChat } from "./NoteChat";

/** A native modal keeps keyboard focus in the reader and the workspace inert. */
export function NoteFullscreen({
  markdown,
  title = "Ghi chú",
  disabled,
  noteId,
  dirty = false,
}: {
  markdown: string;
  title?: string;
  disabled?: boolean;
  noteId?: string;
  dirty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ghost note-fullscreen-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
        </svg>
        Toàn màn hình
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className="note-fullscreen"
            aria-labelledby={headingId}
            onCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <header className="note-fullscreen-header">
              <h2 id={headingId}>{title || "Không tiêu đề"}</h2>
              {noteId && (
                <NoteChat
                  noteId={noteId}
                  title={title ?? "Ghi chú"}
                  dirty={dirty}
                />
              )}
              <button
                type="button"
                className="ghost"
                autoFocus
                onClick={() => setOpen(false)}
              >
                Thoát toàn màn hình
              </button>
            </header>
            <article className="note-fullscreen-content">
              {markdown ? (
                <MarkdownPreview markdown={markdown} />
              ) : (
                <p className="muted">Chưa có nội dung để xem trước.</p>
              )}
            </article>
          </dialog>,
          document.body,
        )}
    </>
  );
}
