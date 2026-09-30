import { AiAction, AiDifficulty, AiLang, AiProvider } from '@kb/shared';

export type AiRunPayload = {
  action: AiAction;
  count?: number;
  targetLang?: AiLang;
  difficulty?: AiDifficulty;
};

export function AiPanel(props: {
  provider: AiProvider;
  lastRun: AiRunPayload;
  questionCount: number;
  questionLang: AiLang;
  difficulty: AiDifficulty;
  onQuestionCountChange: (n: number) => void;
  onQuestionLangChange: (lang: AiLang) => void;
  onDifficultyChange: (d: AiDifficulty) => void;
  onProviderChange: (p: AiProvider) => void;
  preview: string;
  error: string;
  onRun: (payload: AiRunPayload) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <section className="panel">
      <h2>AI</h2>
      <select
        value={props.provider}
        onChange={(e) => props.onProviderChange(e.target.value as AiProvider)}
      >
        <option value="openai">OpenAI</option>
        <option value="deepseek">DeepSeek</option>
      </select>
      <div className="row">
        <button type="button" onClick={() => props.onRun({ action: 'summarize' })}>
          Tóm tắt
        </button>
        <button type="button" onClick={() => props.onRun({ action: 'expand' })}>
          Mở rộng
        </button>
        <button type="button" onClick={() => props.onRun({ action: 'generate-content' })}>
          Soạn nội dung
        </button>
      </div>
      <label>
        Số câu
        <input
          type="number"
          min={1}
          max={8}
          value={props.questionCount}
          onChange={(e) => props.onQuestionCountChange(Number(e.target.value))}
        />
      </label>
      <label>
        Độ khó
        <select
          value={props.difficulty}
          onChange={(e) => props.onDifficultyChange(e.target.value as AiDifficulty)}
        >
          <option value="easy">Dễ</option>
          <option value="medium">Trung bình</option>
          <option value="hard">Khó</option>
        </select>
      </label>
      <label>
        Ngôn ngữ câu hỏi
        <select
          value={props.questionLang}
          onChange={(e) => props.onQuestionLangChange(e.target.value as AiLang)}
        >
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() =>
          props.onRun({
            action: 'generate-questions',
            count: props.questionCount,
            difficulty: props.difficulty,
            targetLang: props.questionLang,
          })
        }
      >
        Sinh câu hỏi
      </button>
      <div className="row">
        <button
          type="button"
          className="ghost"
          onClick={() => props.onRun({ action: 'translate-note', targetLang: 'vi' })}
        >
          Dịch ghi chú → Việt
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => props.onRun({ action: 'translate-note', targetLang: 'en' })}
        >
          Dịch ghi chú → English
        </button>
      </div>
      {props.error && (
        <div className="banner">
          <span>{props.error}</span>
          <button type="button" onClick={() => props.onRun(props.lastRun)}>
            Thử lại
          </button>
        </div>
      )}
      {props.preview && (
        <div>
          <pre className="ai-preview">{props.preview}</pre>
          <button type="button" onClick={props.onApply}>
            Áp dụng
          </button>
          <button type="button" onClick={props.onDiscard}>
            Huỷ
          </button>
        </div>
      )}
    </section>
  );
}
