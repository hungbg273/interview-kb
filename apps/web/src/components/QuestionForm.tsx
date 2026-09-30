import { AiLang, CorrectChoice, CreateQuestionBody } from '@kb/shared';

const letters: CorrectChoice[] = ['A', 'B', 'C', 'D'];

export function QuestionForm(props: {
  value: CreateQuestionBody;
  onChange: (v: CreateQuestionBody) => void;
  onSubmit: () => void;
}) {
  const v = props.value;
  function set<K extends keyof CreateQuestionBody>(key: K, val: CreateQuestionBody[K]) {
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
      <textarea
        placeholder="Câu hỏi"
        value={v.prompt}
        onChange={(e) => set('prompt', e.target.value)}
      />
      {letters.map((L) => (
        <div key={L} className="choice">
          <input
            type="radio"
            name="correct"
            aria-label={`correct-${L}`}
            checked={v.correctChoice === L}
            onChange={() => set('correctChoice', L)}
          />
          <span>{L}</span>
          <input
            aria-label={L}
            value={v[`choice${L}` as const]}
            onChange={(e) => set(`choice${L}` as const, e.target.value)}
          />
        </div>
      ))}
      <label>
        Ngôn ngữ
        <select
          value={v.lang ?? 'vi'}
          onChange={(e) => set('lang', e.target.value as AiLang)}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </label>
      <textarea
        placeholder="Giải thích (tuỳ chọn)"
        value={v.explanationMarkdown ?? ''}
        onChange={(e) => set('explanationMarkdown', e.target.value)}
      />
      <button type="submit">Thêm câu hỏi</button>
    </form>
  );
}
