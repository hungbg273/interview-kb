"use client";
import { useEffect, useRef, useState } from "react";
import type {
  GradeResult,
  PracticeAnswer,
  PracticeAttemptView,
} from "@kb/shared";
import { api } from "@/lib/api";
function Feedback({ result }: { result: GradeResult }) {
  return (
    <div className="panel" aria-label="Nhận xét">
      <h3>{result.score.toFixed(1)} / 10 điểm</h3>
      {result.correctChoice && <p>Đáp án đúng: {result.correctChoice}</p>}
      {result.explanationMarkdown && <p>{result.explanationMarkdown}</p>}
      {result.criteria.map((c) => (
        <p key={c.criterionId}>
          <strong>{c.points} điểm</strong> — {c.explanation}
        </p>
      ))}
      {(
        [
          ["Ý đúng", result.strengths],
          ["Ý thiếu hoặc sai", result.gaps],
          ["Gợi ý cải thiện", result.improvements],
        ] as const
      ).map(
        ([label, values]) =>
          values.length > 0 && (
            <div key={label}>
              <h4>{label}</h4>
              <ul>
                {values.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ),
      )}
      {result.referenceAnswer && (
        <details>
          <summary>Đáp án tham khảo</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{result.referenceAnswer}</p>
        </details>
      )}
    </div>
  );
}
export function PracticeRunner({
  initial,
  onExit,
}: {
  initial: PracticeAttemptView;
  onExit: () => void;
}) {
  const [attempt, setAttempt] = useState(initial);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      initial.items.findIndex((i) => i.state !== "graded"),
    ),
  );
  const [drafts, setDrafts] = useState<Record<string, PracticeAnswer>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const guard = useRef(false);
  const epoch = useRef(0);
  const item = attempt.items[index];
  const locked =
    item.state === "graded" ||
    item.state === "grading" ||
    attempt.status !== "in_progress";
  const answer = locked ? item.answer : (drafts[item.id] ?? item.answer);
  const valid = answer?.type === "essay" ? !!answer.text.trim() : !!answer;
  const waiting =
    attempt.status === "submitting" ||
    attempt.items.some((i) => i.state === "grading");
  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    const poll = async () => {
      if (guard.current) return;
      const version = epoch.current;
      try {
        const next = await api<PracticeAttemptView>(
          `/practice/attempts/${attempt.id}`,
        );
        if (!cancelled && !guard.current && version === epoch.current)
          setAttempt(next);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Không tải được kết quả.");
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [attempt.id, waiting]);
  async function act(mode: "grade" | "next" | "retry") {
    if (guard.current) return;
    epoch.current++;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      let next = attempt;
      if (mode === "retry")
        next = await api(`/practice/attempts/${attempt.id}/retry`, {
          method: "POST",
        });
      else {
        if (!locked) {
          next = await api<PracticeAttemptView>(
            `/practice/attempts/${attempt.id}/questions/${item.id}/${mode === "grade" ? "grade" : "answer"}`,
            {
              method: mode === "grade" ? "POST" : "PATCH",
              body: JSON.stringify({ expectedRevision: item.revision, answer }),
            },
          );
          setAttempt(next);
          setDrafts((prev) => {
            const copy = { ...prev };
            delete copy[item.id];
            return copy;
          });
        }
        if (mode === "next") {
          if (index + 1 < attempt.items.length) setIndex(index + 1);
          else
            next = await api(`/practice/attempts/${attempt.id}/submit`, {
              method: "POST",
            });
        }
      }
      setAttempt(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu hoặc chấm được.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (attempt.status !== "in_progress")
    return (
      <section className="sheet">
        <h1>
          {attempt.status === "completed"
            ? `Điểm: ${attempt.score!.toFixed(1)} / 10`
            : "Đang chấm bài"}
        </h1>
        <p role="status">
          Đã chấm {attempt.items.filter((i) => i.state === "graded").length} /{" "}
          {attempt.total} câu
        </p>
        {attempt.status === "completed" && (
          <p>
            Trắc nghiệm đúng: {attempt.correct} /{" "}
            {attempt.items.filter((i) => i.type === "mcq").length}
          </p>
        )}
        {attempt.items.some((i) => i.state === "grading_failed") && (
          <button disabled={busy} onClick={() => void act("retry")}>
            Chấm lại các câu lỗi
          </button>
        )}
        {attempt.items.map((i, n) => (
          <article className="panel" key={i.id}>
            <h2>
              {n + 1}. {i.prompt}
            </h2>
            <p style={{ whiteSpace: "pre-wrap" }}>
              Bạn trả lời:{" "}
              {i.answer?.type === "essay" ? i.answer.text : i.answer?.choice}
            </p>
            {i.result ? (
              <Feedback result={i.result} />
            ) : (
              <p>
                {i.state === "grading_failed"
                  ? "Chấm lỗi — câu trả lời đã được giữ lại."
                  : "Đang chờ chấm…"}
              </p>
            )}
          </article>
        ))}
        {error && <p role="alert">{error}</p>}
        {attempt.status === "completed" && (
          <button onClick={onExit}>Làm đề khác</button>
        )}
        <p className="field-hint">
          Điểm và nhận xét do AI tạo để hỗ trợ luyện tập.
        </p>
      </section>
    );
  return (
    <section className="sheet" aria-busy={busy}>
      <p className="kicker">
        Câu {index + 1} / {attempt.items.length} ·{" "}
        {item.type === "essay" ? "Tự luận" : "Trắc nghiệm"}
      </p>
      <h1 className="practice-question">{item.prompt}</h1>
      {item.type === "essay" ? (
        <label>
          Câu trả lời
          <textarea
            aria-label="Câu trả lời"
            rows={9}
            maxLength={10000}
            disabled={locked || busy}
            value={answer?.type === "essay" ? answer.text : ""}
            onChange={(e) =>
              setDrafts((p) => ({
                ...p,
                [item.id]: { type: "essay", text: e.target.value },
              }))
            }
          />
          <span className="field-hint">
            Tối đa 10.000 ký tự. Lưu khi chuyển câu hoặc chấm.
          </span>
        </label>
      ) : (
        <fieldset disabled={locked || busy} className="quiz-choices">
          <legend>Chọn đáp án</legend>
          {(["A", "B", "C", "D"] as const).map((letter) => (
            <label key={letter}>
              <input
                type="radio"
                name="choice"
                checked={answer?.type === "mcq" && answer.choice === letter}
                onChange={() =>
                  setDrafts((p) => ({
                    ...p,
                    [item.id]: { type: "mcq", choice: letter },
                  }))
                }
              />
              {letter}. {item[`choice${letter}`]}
            </label>
          ))}
        </fieldset>
      )}
      {item.state === "graded" && <p role="status">Đã chấm — đã khóa</p>}
      {item.state === "grading" && (
        <p role="status">Đang chấm… Câu trả lời tạm khóa.</p>
      )}
      {item.state === "grading_failed" && (
        <p role="alert">Chấm lỗi. Bạn có thể sửa và chấm lại.</p>
      )}
      {item.result && <Feedback result={item.result} />}
      <div className="row">
        <button
          disabled={busy || locked || !valid}
          onClick={() => void act("grade")}
        >
          Chấm câu này
        </button>
        <button
          disabled={busy || (!valid && !locked)}
          onClick={() => void act("next")}
        >
          {index + 1 < attempt.items.length ? "Câu tiếp" : "Nộp bài"}
        </button>
      </div>
      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
