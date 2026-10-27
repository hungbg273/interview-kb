"use client";
import { useId, useState } from "react";
import { MarkdownPreview } from "./MarkdownPreview";
/** Mode is local UI state; the parent owns the draft in both modes. */
export function MarkdownField({
  value,
  onChange,
  disabled,
  className = "pad",
  defaultPreview = true,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  defaultPreview?: boolean;
}) {
  const [previewing, setPreviewing] = useState(defaultPreview);
  const contentId = useId();
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
      </div>
      {previewing ? (
        <section
          className="note-markdown-preview"
          aria-label="Xem trước nội dung"
        >
          {value ? (
            <MarkdownPreview markdown={value} />
          ) : (
            <p className="muted">Chưa có nội dung để xem trước.</p>
          )}
        </section>
      ) : (
        <textarea
          id={contentId}
          disabled={disabled}
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Viết tự do. Không cần Markdown."
        />
      )}
    </>
  );
}
