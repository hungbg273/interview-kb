import { AiLang, CorrectChoice, CreateQuestionBody } from "@kb/shared";

const letters: CorrectChoice[] = ["A", "B", "C", "D"];

export function QuestionForm(props: {
  value: CreateQuestionBody;
  onChange: (v: CreateQuestionBody) => void;
  onSubmit: () => void;
}) {
  const v = props.value;
  function set<K extends keyof CreateQuestionBody>(
    key: K,
    val: CreateQuestionBody[K],
  ) {
    props.onChange({ ...v, [key]: val });
  }
  return (
    <form
      className="mcq panel"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <h3 className="form-heading">Tạo câu hỏi</h3>
      <label>
        Câu hỏi
        <textarea
          placeholder="Nhập nội dung câu hỏi"
          value={v.prompt}
          onChange={(e) => set("prompt", e.target.value)}
        />
      </label>
      <fieldset className="answer-fields">
        <legend>Các đáp án</legend>
        <p className="field-hint">Chọn nút tròn bên cạnh đáp án đúng.</p>
        {letters.map((L) => (
          <div key={L} className="choice">
            <input
              type="radio"
              name="correct"
              aria-label={`correct-${L}`}
              checked={v.correctChoice === L}
              onChange={() => set("correctChoice", L)}
            />
            <span>{L}</span>
            <input
              aria-label={L}
              value={v[`choice${L}` as const]}
              onChange={(e) => set(`choice${L}` as const, e.target.value)}
            />
          </div>
        ))}
      </fieldset>
      <label>
        Ngôn ngữ
        <select
          value={v.lang ?? "vi"}
          onChange={(e) => set("lang", e.target.value as AiLang)}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </label>
      <label>
        Giải thích (tuỳ chọn)
        <textarea
          placeholder="Vì sao đáp án này đúng?"
          value={v.explanationMarkdown ?? ""}
          onChange={(e) => set("explanationMarkdown", e.target.value)}
        />
      </label>
      <button type="submit">Thêm câu hỏi</button>
    </form>
  );
}
