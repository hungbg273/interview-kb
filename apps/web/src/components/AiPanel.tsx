import { ChatgptConnectionPanel } from "./ChatgptConnectionPanel";
import { AiAction, AiDifficulty, AiLang, AiProvider } from "@kb/shared";

export type AiRunPayload = {
  action: AiAction;
  count?: number;
  targetLang?: AiLang;
  difficulty?: AiDifficulty;
};

export function AiPanel(props: {
  busy?: boolean;
  hasUnsavedChanges?: boolean;
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
    <section className="panel ai-panel" aria-busy={!!props.busy}>
      <h2>AI</h2>
      {props.busy && (
        <p className="working-status" role="status">
          AI đang xử lý…
        </p>
      )}
      {props.hasUnsavedChanges && (
        <p className="field-hint">
          AI sử dụng phiên bản ghi chú đã lưu. Lưu thay đổi trước khi chạy để
          dùng nội dung mới nhất.
        </p>
      )}
      <fieldset className="ai-controls" disabled={props.busy}>
        <label>
          Nguồn AI
          <select
            value={props.provider}
            onChange={(e) =>
              props.onProviderChange(e.target.value as AiProvider)
            }
          >
            <option value="chatgpt">ChatGPT — gói của bạn</option>
            <option value="openai">OpenAI API (tính phí riêng)</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </label>
        {props.provider === "chatgpt" && <ChatgptConnectionPanel />}
        <div className="row">
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onRun({ action: "summarize" })}
          >
            Tóm tắt
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onRun({ action: "expand" })}
          >
            Mở rộng
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onRun({ action: "generate-content" })}
          >
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
            onChange={(e) =>
              props.onQuestionCountChange(Number(e.target.value))
            }
          />
        </label>
        <label>
          Độ khó
          <select
            value={props.difficulty}
            onChange={(e) =>
              props.onDifficultyChange(e.target.value as AiDifficulty)
            }
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
            onChange={(e) =>
              props.onQuestionLangChange(e.target.value as AiLang)
            }
          >
            <option value="vi">Tiếng Việt</option>
            <option value="en">English</option>
          </select>
        </label>
        <button
          type="button"
          disabled={props.busy}
          onClick={() =>
            props.onRun({
              action: "generate-questions",
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
            disabled={props.busy}
            className="ghost"
            onClick={() =>
              props.onRun({ action: "translate-note", targetLang: "vi" })
            }
          >
            Dịch ghi chú → Việt
          </button>
          <button
            type="button"
            disabled={props.busy}
            className="ghost"
            onClick={() =>
              props.onRun({ action: "translate-note", targetLang: "en" })
            }
          >
            Dịch ghi chú → English
          </button>
        </div>
      </fieldset>
      {props.error && (
        <div className="banner" role="alert">
          <span>{props.error}</span>
          <button
            type="button"
            disabled={props.busy}
            onClick={() => props.onRun(props.lastRun)}
          >
            Thử lại
          </button>
        </div>
      )}
      {props.preview && (
        <div>
          <p className="field-hint">
            Xem lại nội dung trước khi áp dụng vào ghi chú.
          </p>
          <pre className="ai-preview">{props.preview}</pre>
          <button type="button" disabled={props.busy} onClick={props.onApply}>
            Áp dụng
          </button>
          <button type="button" disabled={props.busy} onClick={props.onDiscard}>
            Huỷ
          </button>
        </div>
      )}
    </section>
  );
}
