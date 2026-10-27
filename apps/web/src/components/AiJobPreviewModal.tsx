"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MarkdownPreview } from "./MarkdownPreview";
import type { AiJobResult, AiJobView } from "@kb/shared";
import { api } from "@/lib/api";
import { jobStatusLabel } from "@/lib/ai-jobs";
import { WorkspaceLink } from "./WorkspaceNavigation";

type PreviewQuestion = {
  id: string;
  prompt: string;
  choiceA?: string;
  choiceB?: string;
  choiceC?: string;
  choiceD?: string;
};
export function AiJobPreviewModal({
  job,
  onClose,
  onApply,
}: {
  job: AiJobView;
  onClose: () => void;
  onApply: () => Promise<void>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<AiJobResult | null>(null);
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [loading, setLoading] = useState(job.status === "succeeded");
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const siblings = [...document.body.children].filter(
      (el) => el !== root.current,
    ) as HTMLElement[];
    const previous = siblings.map((el) => el.inert);
    siblings.forEach((el) => {
      el.inert = true;
    });
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const contain = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        dialog.current?.focus();
    };
    document.addEventListener("focusin", contain);
    return () => {
      document.removeEventListener("focusin", contain);
      siblings.forEach((el, i) => {
        el.inert = previous[i];
      });
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);
  useEffect(() => {
    if (job.status !== "succeeded") return;
    const abort = new AbortController();
    let alive = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const data = await api<AiJobResult>(`/ai-jobs/${job.id}/result`, {
          signal: abort.signal,
        });
        let items: PreviewQuestion[] = data.items ?? [];
        if (data.questionIds?.length && job.noteId) {
          const note = await api<{ questions: PreviewQuestion[] }>(
            `/notes/${job.noteId}`,
            { signal: abort.signal },
          );
          items = (note.questions ?? []).filter((q) =>
            data.questionIds!.includes(q.id),
          );
        }
        if (alive) {
          setResult(data);
          setQuestions(items);
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Không tải được kết quả AI.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      abort.abort();
    };
  }, [job.id, job.status, job.noteId]);
  async function apply() {
    setApplying(true);
    setError("");
    try {
      await onApply();
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không áp dụng được kết quả.");
    } finally {
      setApplying(false);
    }
  }
  return createPortal(
    <div className="ai-preview-overlay" ref={root}>
      <div
        ref={dialog}
        className="ai-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Kết quả AI"
        aria-describedby="ai-preview-source"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
          if (event.key === "Tab") {
            const controls = [
              ...dialog.current!.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href], [tabindex="0"]',
              ),
            ];
            const first = controls[0],
              last = controls[controls.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (
              !event.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header className="ai-preview-header">
          <div>
            <h2>Kết quả AI</h2>
            <p id="ai-preview-source">
              {job.noteTitle} · {jobStatusLabel[job.status]}
            </p>
          </div>
          <button
            className="ghost"
            type="button"
            aria-label="Đóng bản xem trước"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="ai-preview-content" aria-busy={loading}>
          {loading && <p role="status">Đang tải kết quả…</p>}
          {error && (
            <p role="alert" className="banner">
              {error}
            </p>
          )}
          {job.status === "failed" && (
            <p role="alert">
              {job.error?.message || "Yêu cầu AI chưa hoàn tất."}
            </p>
          )}
          {["queued", "running", "retrying"].includes(job.status) && (
            <p role="status">
              AI đang xử lý trong nền. Kết quả sẽ xuất hiện ở đây khi hoàn tất.
            </p>
          )}
          {result?.markdown && (
            <div className="markdown-body">
              <MarkdownPreview markdown={result.markdown} />
            </div>
          )}
          {questions.map((q, index) => (
            <article className="ai-preview-question" key={q.id}>
              <h3>
                {index + 1}. {q.prompt}
              </h3>
              <ol type="A">
                {[q.choiceA, q.choiceB, q.choiceC, q.choiceD].map(
                  (choice, i) => (
                    <li key={i}>{choice}</li>
                  ),
                )}
              </ol>
            </article>
          ))}
          {!loading && result && !result.markdown && !questions.length && (
            <p>
              Không có nội dung xem trước. Câu hỏi có thể đã được chỉnh sửa hoặc
              xóa.
            </p>
          )}
          {applied && <p role="status">Đã áp dụng vào ghi chú.</p>}
        </div>
        <footer className="ai-preview-footer">
          <button type="button" className="ghost" onClick={onClose}>
            Đóng
          </button>
          {result?.markdown && job.noteId && (
            <button
              type="button"
              disabled={applying || applied}
              onClick={() => void apply()}
            >
              {applying
                ? "Đang áp dụng…"
                : applied
                  ? "Đã áp dụng"
                  : "Áp dụng vào ghi chú"}
            </button>
          )}
          {result?.draftId && (
            <WorkspaceLink href={`/practice?aiJob=${job.id}`} onClick={onClose}>
              Mở phần luyện tập
            </WorkspaceLink>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
