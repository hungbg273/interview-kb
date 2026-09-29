export function NoteEditor(props: {
  title: string;
  bodyMarkdown: string;
  onTitleChange: (title: string) => void;
  onBodyChange: (bodyMarkdown: string) => void;
  onSave: () => void;
  error?: string;
}) {
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
      <button type="button" onClick={props.onSave}>
        Lưu
      </button>
    </div>
  );
}
