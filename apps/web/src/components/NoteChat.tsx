"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AiProvider } from "@kb/shared";
import { api } from "@/lib/api";
import { MarkdownPreview } from "./MarkdownPreview";

type Turn = {
  id: string;
  question: string;
  answer: string;
  provider: AiProvider;
  createdAt: string;
};
type History = { turns: Turn[]; revision: number; pending: boolean };
const providers = {
  chatgpt: "ChatGPT",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

export function NoteChat({
  noteId,
  title,
  dirty,
}: {
  noteId: string;
  title: string;
  dirty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [motion, setMotion] = useState<"entering" | "visible" | "closing">(
    "entering",
  );
  const [history, setHistory] = useState<History | null>(null);
  const [question, setQuestion] = useState("");
  const [provider, setProvider] = useState<AiProvider>("chatgpt");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const retry = useRef<{
    message: string;
    provider: AiProvider;
    requestId: string;
    revision: number;
  } | null>(null);
  const mounted = useRef(true);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const path = `/notes/${noteId}/chat`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => setMotion("visible"));
    return () => {
      cancelAnimationFrame(frame);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      element.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus();
    };
  }, [open]);
  function closeChat() {
    if (!open || motion === "closing") return;
    setMotion("closing");
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  }

  useEffect(() => {
    if (!open || pending.current) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    const load = async () => {
      try {
        const next = await api<History>(path, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setHistory(next);
        const request = retry.current;
        if (request) {
          if (next.turns.some((turn) => turn.id === request.requestId)) {
            setQuestion((value) =>
              value.trim() === request.message ? "" : value,
            );
            retry.current = null;
          } else if (!next.pending) {
            retry.current = { ...request, revision: next.revision };
          }
        }
        setError("");
        if (next.pending) timer = setTimeout(() => void load(), 3000);
      } catch (e) {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Không tải được lịch sử chat.",
          );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [open, path, reload]);
  useEffect(() => {
    if (transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [history?.turns.length, sending, open]);

  async function send() {
    const message = question.trim();
    if (
      !message ||
      !history ||
      dirty ||
      pending.current ||
      history.pending ||
      loading
    )
      return;
    pending.current = true;
    setSending(true);
    setError("");
    const request =
      retry.current?.message === message && retry.current.provider === provider
        ? retry.current
        : {
            message,
            provider,
            requestId: crypto.randomUUID(),
            revision: history.revision,
          };
    retry.current = request;
    try {
      const next = await api<History>(path, {
        method: "POST",
        body: JSON.stringify(request),
      });
      if (!mounted.current) return;
      setHistory(next);
      setQuestion("");
      retry.current = null;
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Không gửi được câu hỏi. Hãy thử lại.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setSending(false);
    }
  }
  async function clear() {
    if (
      !history ||
      pending.current ||
      history.pending ||
      !window.confirm("Xóa toàn bộ lịch sử chat của note này?")
    )
      return;
    pending.current = true;
    setSending(true);
    setError("");
    try {
      const next = await api<History>(`${path}/clear`, {
        method: "POST",
        body: JSON.stringify({ revision: history.revision }),
      });
      if (mounted.current) {
        setHistory(next);
        retry.current = null;
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Không xóa được lịch sử.");
    } finally {
      pending.current = false;
      if (mounted.current) setSending(false);
    }
  }
  const busy = sending || history?.pending;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ghost note-chat-trigger"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Hỏi về note
      </button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className={`note-chat-window is-${motion}`}
            aria-labelledby={`${id}-title`}
            onCancel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeChat();
            }}
            onClose={() => {
              if (motion !== "closing") setOpen(false);
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <header className="note-chat-header">
              <div>
                <h2 id={`${id}-title`}>Hỏi về note</h2>
                <p>{title || "Không tiêu đề"}</p>
              </div>
              <button
                type="button"
                className="ghost"
                autoFocus
                onClick={closeChat}
              >
                Đóng chat
              </button>
            </header>
            <div className="note-chat-settings">
              <label htmlFor={`${id}-provider`}>AI</label>
              <select
                id={`${id}-provider`}
                value={provider}
                disabled={!!busy}
                onChange={(event) => {
                  setProvider(event.target.value as AiProvider);
                  retry.current = null;
                }}
              >
                {Object.entries(providers).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghost"
                disabled={!!busy || loading || !history?.turns.length}
                onClick={() => void clear()}
              >
                Xóa lịch sử
              </button>
            </div>
            <p className="note-chat-context">
              Dựa trên note đã lưu và các lượt chat gần nhất. AI đọc văn bản,
              chưa phân tích ảnh trong note.
            </p>
            <div
              ref={transcript}
              className="note-chat-transcript"
              aria-label="Lịch sử chat"
              aria-busy={!!busy}
            >
              {loading && <p role="status">Đang tải lịch sử…</p>}
              {!loading && history?.turns.length === 0 && (
                <div className="note-chat-empty">
                  <h3>Bạn muốn hiểu rõ điều gì?</h3>
                  <p>
                    Hỏi về một khái niệm, yêu cầu ví dụ hoặc cùng AI phân tích
                    một tình huống.
                  </p>
                  {[
                    "Giải thích các ý chính trong note",
                    "Cho ví dụ thực tế về nội dung này",
                  ].map((text) => (
                    <button
                      key={text}
                      className="ghost"
                      type="button"
                      disabled={!!busy}
                      onClick={() => setQuestion(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              {history?.turns.map((turn) => (
                <section key={turn.id} className="note-chat-turn">
                  <div className="note-chat-question">
                    <span>Bạn</span>
                    <p>{turn.question}</p>
                  </div>
                  <div className="note-chat-answer">
                    <span>{providers[turn.provider]}</span>
                    <MarkdownPreview markdown={turn.answer} />
                  </div>
                </section>
              ))}
              {busy && (
                <p role="status">
                  AI đang trả lời… Bạn có thể đóng cửa sổ và quay lại.
                </p>
              )}
            </div>
            <form
              className="note-chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {dirty && (
                <p className="field-hint">
                  Lưu thay đổi trong note trước khi gửi câu hỏi để AI đọc đúng
                  nội dung.
                </p>
              )}
              {error && (
                <div role="alert" className="error">
                  {error}{" "}
                  <button
                    type="button"
                    className="ghost"
                    disabled={sending || loading}
                    onClick={() => {
                      setReload((v) => v + 1);
                    }}
                  >
                    Tải lại lịch sử
                  </button>
                </div>
              )}
              <label htmlFor={`${id}-question`}>Câu hỏi của bạn</label>
              <textarea
                id={`${id}-question`}
                rows={3}
                maxLength={2000}
                value={question}
                disabled={!!busy}
                placeholder="Ví dụ: Vì sao cần bước này?"
                onChange={(event) => {
                  setQuestion(event.target.value);
                  retry.current = null;
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey) &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="note-chat-send">
                <span>Ctrl/Cmd + Enter để gửi</span>
                <button
                  type="submit"
                  disabled={!!busy || loading || !history || dirty}
                >
                  Gửi câu hỏi
                </button>
              </div>
            </form>
          </dialog>,
          document.body,
        )}
    </>
  );
}
