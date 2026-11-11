import { MarkdownField } from "./MarkdownField";
import { useEffect, useState } from "react";

export function NoteEditor(props: {
  disabled?: boolean;
  noteId?: string;
  dirty?: boolean;
  title: string;
  bodyMarkdown: string;
  onTitleChange: (title: string) => void;
  onBodyChange: (bodyMarkdown: string) => void;
  onSave: () => void | boolean | Promise<void | boolean>;
  onSavedAck?: () => void;
  error?: string;
  topics?: Array<{ id: string; name: string }>;
  topicQuery?: string;
  topicHits?: Array<{ id: string; name: string }>;
  onTopicQueryChange?: (q: string) => void;
  onAddTopic?: (topic: { id: string; name: string }) => void;
  onRemoveTopic?: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const [saveError, setSaveError] = useState("");
  useEffect(() => {
    setSaved(false);
  }, [props.title, props.bodyMarkdown, props.topics]);

  async function handleSave() {
    if (saving || uploading || props.disabled) return;
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      const result = await props.onSave();
      if (result !== false) {
        setSaved(true);
        props.onSavedAck?.();
      }
    } catch {
      setSaveError(
        "Không lưu được ghi chú. Nội dung của bạn vẫn được giữ, hãy thử lại.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor">
      <fieldset className="editor-fields" disabled={saving || props.disabled}>
        <label>
          Tiêu đề
          <input
            value={props.title}
            onChange={(e) => props.onTitleChange(e.target.value)}
            placeholder="Ví dụ: TCP handshake"
          />
        </label>
        {props.topics && (
          <div className="chips">
            {props.topics.map((t) => (
              <span key={t.id} className="chip">
                {t.name}
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Bỏ ${t.name}`}
                  onClick={() => props.onRemoveTopic?.(t.id)}
                >
                  ×
                </button>
              </span>
            ))}
            <div className="search-field">
              <input
                value={props.topicQuery ?? ""}
                onChange={(e) => props.onTopicQueryChange?.(e.target.value)}
                aria-label="Thêm chủ đề cho ghi chú"
                placeholder="+ Chủ đề"
              />
              {(props.topicHits ?? []).length > 0 && (
                <div className="search-overlay">
                  {(props.topicHits ?? []).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="ghost"
                      onClick={() => {
                        props.onAddTopic?.(t);
                        props.onTopicQueryChange?.("");
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {props.error && <p className="error">{props.error}</p>}
        <MarkdownField
          title={props.title}
          noteId={props.noteId}
          dirty={props.dirty}
          onUploadStateChange={setUploading}
          value={props.bodyMarkdown}
          onChange={props.onBodyChange}
          disabled={saving || props.disabled}
        />
        <button
          type="button"
          className="editor-save"
          disabled={uploading}
          onClick={() => void handleSave()}
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </fieldset>
      <p className="save-status" role="status" aria-live="polite">
        {saved ? "Đã lưu" : ""}
      </p>
      {saveError && (
        <p className="error" role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}
