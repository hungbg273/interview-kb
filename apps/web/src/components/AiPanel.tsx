import { AiAction, AiProvider } from '@kb/shared';

export function AiPanel(props: {
  provider: AiProvider;
  lastAction: AiAction;
  onProviderChange: (p: AiProvider) => void;
  preview: string;
  error: string;
  onRun: (action: AiAction) => void;
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
        <button type="button" onClick={() => props.onRun('summarize')}>
          Tóm tắt
        </button>
        <button type="button" onClick={() => props.onRun('expand')}>
          Mở rộng
        </button>
        <button type="button" onClick={() => props.onRun('generate-questions')}>
          Sinh câu hỏi
        </button>
      </div>
      {props.error && (
        <div className="banner">
          <span>{props.error}</span>
          <button type="button" onClick={() => props.onRun(props.lastAction)}>
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
