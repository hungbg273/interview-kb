"use client";
import { useEffect, useRef } from "react";
import type { useInterview } from "./use-interview";
import styles from "./interview.module.css";
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

export function LiveInterview({
  interview,
  recognition,
  onReset,
}: {
  interview: ReturnType<typeof useInterview>;
  recognition: boolean;
  onReset: () => void;
}) {
  const { session, busy } = interview;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [session?.turns.length]);
  if (!session) return null;
  const provider = session.setup.provider === "openai" ? "OpenAI" : "DeepSeek";
  return (
    <div className={styles.liveGrid}>
      <section className={styles.paper}>
        <div className={styles.liveHeader}>
          <div>
            <p className={styles.eyebrow}>
              {provider} / {session.setup.level} /{" "}
              {session.setup.lang === "en" ? "English" : "Tiếng Việt"}
            </p>
            <h3 className={styles.sectionTitle}>
              {session.status === "finished" || interview.stopped
                ? "Interview complete"
                : "Let’s talk."}
            </h3>
          </div>
          <span className={styles.clock} aria-label="Time remaining">
            {session.status === "finished" || interview.stopped
              ? "Ended"
              : formatTime(interview.remaining)}
          </span>
        </div>
        <p className={styles.hint} role="status">
          {busy ? "Working…" : interview.voiceStatus}
        </p>
        <div
          className={styles.transcript}
          role="log"
          aria-label="Interview transcript"
          aria-live="polite"
        >
          {session.turns.length === 0 && (
            <p className={styles.hint}>
              Your interviewer will introduce the session here.
            </p>
          )}
          {session.turns.map((turn) => (
            <article
              key={turn.id}
              className={
                turn.role === "assistant"
                  ? styles.interviewer
                  : styles.candidate
              }
            >
              <span>{turn.role === "assistant" ? "Interviewer" : "You"}</span>
              <p>{turn.text}</p>
            </article>
          ))}
          <div ref={end} />
        </div>
        {session.status === "active" && !interview.stopped && (
          <>
            {session.setup.provider === "deepseek" && !recognition && (
              <p className={styles.notice}>
                Speech recognition is unavailable in this browser. Type your
                answers below; questions remain visible.
              </p>
            )}
            {session.setup.provider === "openai" && !interview.connected && (
              <div className={styles.controls}>
                <button
                  disabled={busy || interview.connecting}
                  onClick={() => void interview.reconnect(false)}
                >
                  Reconnect microphone
                </button>
                <button
                  disabled={busy || interview.connecting}
                  className="ghost"
                  onClick={() => void interview.reconnect(true)}
                >
                  Connect with typed answers
                </button>
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void interview.sendAnswer();
              }}
              className={styles.answerForm}
            >
              <label htmlFor="interview-answer">Your answer</label>
              <textarea
                id="interview-answer"
                value={interview.answer}
                onChange={(event) => interview.setAnswer(event.target.value)}
                maxLength={6000}
                rows={4}
                placeholder="Think it through. Then tell your story."
                disabled={busy}
              />
              <div className={styles.controls}>
                {session.setup.provider === "deepseek" && recognition && (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={interview.dictate}
                  >
                    {interview.listening ? "Stop dictation" : "Dictate answer"}
                  </button>
                )}
                <button
                  type="button"
                  className="ghost"
                  aria-pressed={interview.muted}
                  onClick={interview.toggleMute}
                >
                  {interview.muted ? "Unmute" : "Mute"}
                </button>
                <button
                  type="submit"
                  disabled={
                    busy ||
                    !interview.answer.trim() ||
                    (session.setup.provider === "openai" &&
                      !interview.connected)
                  }
                >
                  Send answer
                </button>
              </div>
            </form>
            <div className={styles.formFooter}>
              <span className={styles.hint}>
                Finish for feedback whenever you’re ready.
              </span>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void interview.finish()}
              >
                Finish interview
              </button>
            </div>
          </>
        )}
        {interview.stopped && !session.feedback && (
          <button disabled={busy} onClick={() => void interview.finish()}>
            {busy ? "Preparing feedback…" : "Retry finishing & feedback"}
          </button>
        )}
        {session.status === "finished" && session.feedback && (
          <button className="ghost" onClick={onReset}>
            Prepare another interview
          </button>
        )}
      </section>
      <aside className={styles.feedbackPanel}>
        {session.feedback ? (
          <>
            <p className={styles.eyebrow}>Your next step</p>
            <h3>Practice, reflected.</h3>
            <p className={styles.hint}>
              AI-generated practice guidance · based on your transcript
            </p>
            <p>{session.feedback.summary}</p>
            {session.feedback.assessments.map((item) => (
              <div className={styles.assessment} key={item.criterion}>
                <h4>
                  {item.criterion}
                  <span>{item.score}/5</span>
                </h4>
                <p>{item.feedback}</p>
                {item.evidence && <blockquote>“{item.evidence}”</blockquote>}
              </div>
            ))}
            <h2 className={styles.smallHeading}>For your next interview</h2>
            <ul>
              {session.feedback.improvements.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
            {session.feedback.strongerAnswer && (
              <details>
                <summary>A stronger answer</summary>
                <p>{session.feedback.strongerAnswer}</p>
              </details>
            )}
          </>
        ) : (
          <>
            <p className={styles.eyebrow}>Your practice focus</p>
            <h3>
              Stay curious.
              <br />
              Think out loud.
            </h3>
            <div className={styles.rule} />
            <p>
              {session.setup.documents?.length
                ? session.setup.documents
                    .map(
                      (document) =>
                        `${document.source.toUpperCase()} · ${document.filename}`,
                    )
                    .join(" · ")
                : session.setup.filename || "Library context only"}
            </p>
            <p>
              {session.context.subjects.map((item) => item.name).join(" · ")}
            </p>
            <ul>
              {session.context.notes.map((note) => (
                <li key={note.id}>{note.title}</li>
              ))}
            </ul>
            <p className={styles.hint}>
              Feedback will appear here when you finish. Your interviewer will
              ask follow-up questions before sharing guidance.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
