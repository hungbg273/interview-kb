import { MarkdownField } from "./MarkdownField";
import { useState } from "react";

export function NoteEditor(props: {
  disabled?: boolean;
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
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (saving || props.disabled) return;
    setSaving(true);
    try {
      const result = await props.onSave();
      if (result !== false) setSaved(true);
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
          value={props.bodyMarkdown}
          onChange={props.onBodyChange}
          disabled={saving || props.disabled}
        />
        <button
          type="button"
          className="editor-save"
          onClick={() => void handleSave()}
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </fieldset>
      {saved && (
        <div className="save-pop" role="presentation">
          <div
            className="save-pop-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-pop-title"
          >
            <h2 id="save-pop-title">Đã lưu</h2>
            <p>Ghi chú đã được lưu.</p>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setSaved(false);
                props.onSavedAck?.();
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
