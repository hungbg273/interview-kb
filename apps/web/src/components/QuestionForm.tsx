import { AiLang, CorrectChoice, QuestionInput } from "@kb/shared";

const letters: CorrectChoice[] = ["A", "B", "C", "D"];

export function QuestionForm(props: {
  value: QuestionInput;
  onChange: (v: QuestionInput) => void;
  onSubmit: () => void;
}) {
  const v = props.value;
  function set<K extends keyof QuestionInput>(key: K, val: QuestionInput[K]) {
    props.onChange({ ...v, [key]: val } as QuestionInput);
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
        Loại câu hỏi
        <select
          value={v.type ?? "mcq"}
          onChange={(e) =>
            props.onChange(
              e.target.value === "essay"
                ? {
                    type: "essay",
                    prompt: v.prompt,
                    lang: v.lang,
                    referenceAnswer: "",
                    rubric: [
                      {
                        id: "accuracy",
                        description: "Đúng kiến thức và giải thích",
                        maxPoints: 10,
                      },
                    ],
                  }
                : {
                    type: "mcq",
                    prompt: v.prompt,
                    lang: v.lang,
                    choiceA: "",
                    choiceB: "",
                    choiceC: "",
                    choiceD: "",
                    correctChoice: "A",
                  },
            )
          }
        >
          <option value="mcq">Trắc nghiệm</option>
          <option value="essay">Tự luận</option>
        </select>
      </label>
      <label>
        Câu hỏi
        <textarea
          placeholder="Nhập nội dung câu hỏi"
          value={v.prompt}
          onChange={(e) => set("prompt", e.target.value)}
        />
      </label>
      {v.type !== "essay" ? (
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
      ) : (
        <>
          <label>
            Đáp án tham khảo
            <textarea
              maxLength={10000}
              required
              value={v.referenceAnswer}
              onChange={(e) =>
                props.onChange({ ...v, referenceAnswer: e.target.value })
              }
            />
          </label>
          <fieldset>
            <legend>Tiêu chí chấm — tổng 10 điểm</legend>
            {v.rubric.map((r, i) => (
              <div className="row" key={r.id}>
                <label>
                  Tiêu chí {i + 1}
                  <input
                    required
                    maxLength={1000}
                    value={r.description}
                    onChange={(e) =>
                      props.onChange({
                        ...v,
                        rubric: v.rubric.map((c, n) =>
                          n === i ? { ...c, description: e.target.value } : c,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Điểm tối đa
                  <input
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={r.maxPoints}
                    onChange={(e) =>
                      props.onChange({
                        ...v,
                        rubric: v.rubric.map((c, n) =>
                          n === i
                            ? { ...c, maxPoints: Number(e.target.value) }
                            : c,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={v.rubric.length === 1}
                  onClick={() =>
                    props.onChange({
                      ...v,
                      rubric: v.rubric.filter((_, n) => n !== i),
                    })
                  }
                >
                  Xóa tiêu chí {i + 1}
                </button>
              </div>
            ))}
            <p>
              Tổng:{" "}
              {v.rubric.reduce((sum, r) => sum + r.maxPoints, 0).toFixed(1)} /
              10
            </p>
            <button
              type="button"
              disabled={v.rubric.length >= 10}
              onClick={() =>
                props.onChange({
                  ...v,
                  rubric: [
                    ...v.rubric,
                    { id: crypto.randomUUID(), description: "", maxPoints: 1 },
                  ],
                })
              }
            >
              Thêm tiêu chí
            </button>
          </fieldset>
        </>
      )}
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
