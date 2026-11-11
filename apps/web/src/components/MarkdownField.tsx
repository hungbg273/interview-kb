"use client";
import { useId, useRef, useState } from "react";
import { useClipboardImages } from "./useClipboardImages";
import { NoteFullscreen } from "./NoteFullscreen";
import { MarkdownPreview } from "./MarkdownPreview";
/** Mode is local UI state; the parent owns the draft in both modes. */
export function MarkdownField({
  value,
  title,
  noteId,
  dirty = false,
  onChange,
  disabled,
  className = "pad",
  defaultPreview = true,
  onUploadStateChange,
}: {
  value: string;
  title?: string;
  noteId?: string;
  dirty?: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  defaultPreview?: boolean;
  onUploadStateChange?: (busy: boolean) => void;
}) {
  const [previewing, setPreviewing] = useState(defaultPreview);
  const contentId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { onPaste, uploading, error } = useClipboardImages(
    value,
    onChange,
    disabled,
    textarea,
    onUploadStateChange,
  );
  return (
    <>
      <div className="note-content-toolbar">
        <label htmlFor={previewing ? undefined : contentId}>Nội dung</label>
        <div
          className="markdown-mode-switch"
          role="group"
          aria-label="Chế độ nội dung"
        >
          <button
            type="button"
            className="ghost"
            disabled={disabled}
            aria-pressed={!previewing}
            onClick={() => setPreviewing(false)}
          >
            Chỉnh sửa
          </button>
          <button
            type="button"
            className="ghost"
            disabled={disabled}
            aria-pressed={previewing}
            onClick={() => setPreviewing(true)}
          >
            Xem trước
          </button>
        </div>
        <NoteFullscreen
          markdown={value}
          title={title}
          disabled={disabled}
          noteId={noteId}
          dirty={dirty}
        />
      </div>
      {uploading && (
        <p className="field-hint" role="status">
          Đang tải ảnh… Bạn có thể tiếp tục viết.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {previewing ? (
        <section
          className="note-markdown-preview"
          aria-label="Xem trước nội dung"
          tabIndex={0}
        >
          {value ? (
            <MarkdownPreview markdown={value} />
          ) : (
            <p className="muted">Chưa có nội dung để xem trước.</p>
          )}
        </section>
      ) : (
        <textarea
          ref={textarea}
          onPaste={onPaste}
          aria-describedby={`${contentId}-hint`}
          id={contentId}
          disabled={disabled}
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Viết tự do. Không cần Markdown."
        />
      )}
      {!previewing && (
        <p id={`${contentId}-hint`} className="field-hint">
          Dán ảnh bằng Ctrl/Cmd+V · PNG, JPEG, WebP · tối đa 5 MB/ảnh.
        </p>
      )}
    </>
  );
}
