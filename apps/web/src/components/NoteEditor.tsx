import { useState } from 'react';

export function NoteEditor(props: {
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
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const result = await props.onSave();
    if (result === false) return;
    setSaved(true);
  }

  return (
    <div className="editor">
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
              value={props.topicQuery ?? ''}
              onChange={(e) => props.onTopicQueryChange?.(e.target.value)}
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
                      props.onTopicQueryChange?.('');
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
      <label>
        Nội dung
        <textarea
          className="pad"
          value={props.bodyMarkdown}
          onChange={(e) => props.onBodyChange(e.target.value)}
          placeholder="Viết tự do. Không cần Markdown."
        />
      </label>
      <button type="button" onClick={() => void handleSave()}>
        Lưu
      </button>
      {saved && (
        <div className="save-pop" role="presentation">
          <div className="save-pop-card" role="dialog" aria-labelledby="save-pop-title">
            <h2 id="save-pop-title">Đã lưu</h2>
            <p>Ghi chú đã được lưu.</p>
            <button
              type="button"
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
