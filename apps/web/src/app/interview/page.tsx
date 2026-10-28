"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  InterviewAvailability,
  InterviewContext,
  InterviewSetup,
  InterviewDocument,
} from "@kb/shared";
import { api } from "@/lib/api";
import { supportsSpeechRecognition } from "@/lib/interview-voice";
import { LibraryPicker, type LibraryChoice } from "./LibraryPicker";
import { useInterview } from "./use-interview";
import { LiveInterview } from "./LiveInterview";
import { VoicePicker } from "./VoicePicker";
import styles from "./interview.module.css";

const levels = ["fresher", "junior", "middle", "senior", "expert"] as const;
const providerName = (value: string) =>
  value === "openai" ? "OpenAI" : "DeepSeek";

export default function InterviewPage() {
  const interview = useInterview();
  const { session, busy, error, setError } = interview;
  const [availability, setAvailability] =
    useState<InterviewAvailability | null>(null);
  const [providerError, setProviderError] = useState("");
  const [source, setSource] = useState<"jd" | "cv">("jd");
  const [documents, setDocuments] = useState<InterviewDocument[]>([]);
  const currentDocument = documents.find(
    (document) => document.source === source,
  );
  const filename = currentDocument?.filename ?? "";
  const documentText = currentDocument?.text ?? "";
  const [level, setLevel] = useState<InterviewSetup["level"]>("junior");
  const [lang, setLang] = useState<"en" | "vi">("vi");
  const [provider, setProvider] =
    useState<InterviewSetup["provider"]>("deepseek");
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [voice, setVoice] = useState("");
  const [voiceLabel, setVoiceLabel] = useState("Automatic");
  const chooseVoice = useCallback((id: string, label: string) => {
    setVoice(id);
    setVoiceLabel(label);
  }, []);
  useEffect(() => {
    chooseVoice("", "Automatic");
  }, [provider, lang, chooseVoice]);
  const [selected, setSelected] = useState<LibraryChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<{
    setup: InterviewSetup;
    context: InterviewContext;
    voiceLabel: string;
  } | null>(null);
  const [textOnly, setTextOnly] = useState(false);
  const [recognition, setRecognition] = useState(false);
  const upload = useRef<AbortController | null>(null);
  const operations = useRef(false);

  async function loadProviders(signal?: AbortSignal) {
    setProviderError("");
    try {
      const value = await api<InterviewAvailability>("/interviews/providers", {
        signal,
      });
      if (!signal?.aborted) {
        setAvailability(value);
        setProvider((old) =>
          value[old].available
            ? old
            : value.openai.available
              ? "openai"
              : "deepseek",
        );
      }
    } catch {
      if (!signal?.aborted)
        setProviderError("Could not load provider availability.");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void loadProviders(controller.signal);
    setRecognition(supportsSpeechRecognition());
    return () => {
      controller.abort();
      upload.current?.abort();
    };
  }, []);

  async function extract(file?: File) {
    if (!file) return;
    upload.current?.abort();
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a PDF or DOCX smaller than 5 MB.");
      return;
    }
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError("Choose a PDF or DOCX file.");
      return;
    }
    const controller = new AbortController();
    upload.current = controller;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<{ filename: string; text: string }>(
        "/interviews/documents",
        { method: "POST", body: form, signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setDocuments((previous) => [
          ...previous.filter((document) => document.source !== source),
          { source, text: result.text, filename: result.filename },
        ]);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "Could not read this document.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  async function review(event: React.FormEvent) {
    event.preventDefault();
    if (operations.current) return;
    operations.current = true;
    setLoading(true);
    setError("");
    const setup: InterviewSetup = {
      documents,
      level,
      lang,
      provider,
      durationMinutes,
      voice: provider === "openai" ? voice || "marin" : voice || undefined,
      topicIds: selected
        .filter((item) => item.kind === "subject")
        .map((item) => item.id),
      noteIds: selected
        .filter((item) => item.kind === "note")
        .map((item) => item.id),
    };
    try {
      const context = await api<InterviewContext>("/interviews/preview", {
        method: "POST",
        body: JSON.stringify(setup),
      });
      setBrief({
        setup,
        context,
        voiceLabel: provider === "openai" && !voice ? "Marin" : voiceLabel,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not prepare this interview.",
      );
    } finally {
      operations.current = false;
      setLoading(false);
    }
  }
  const emptyDocument = documents.find(
    (document) => !document.text.trim() || !document.filename.trim(),
  );
  const reviewBlocker = loading
    ? "Preparing your materials…"
    : !availability
      ? providerError
        ? "Retry loading AI providers above."
        : "Checking available AI providers…"
      : !availability[provider].available
        ? availability[provider].reason ||
          "Configure an AI provider before continuing."
        : emptyDocument
          ? `Review or remove the empty ${emptyDocument.source.toUpperCase()} document to continue.`
          : !documents.length && !selected.length
            ? "Add a JD, CV, subject, or note to continue."
            : "";
  const canReview = !reviewBlocker;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            Practice room /{" "}
            {session ? "In conversation" : "Prepare with intention"}
          </p>
          <h1>
            Mock interview<span className={styles.titleDot}>.</span>
          </h1>
          <p className={styles.subtitle}>
            Your experience. Your knowledge. A conversation that puts both to
            work.
          </p>
        </div>
        <div className={styles.headerStamp}>
          <span aria-hidden="true">◉</span>
          <span>
            ONE QUESTION
            <br />
            AT A TIME
          </span>
        </div>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {!session && !brief && (
        <div className={styles.setupGrid}>
          <form className={styles.paper} onSubmit={review}>
            <fieldset disabled={loading || busy} className={styles.fieldset}>
              <legend>
                <span className={styles.step}>01</span> Bring your context
              </legend>
              <p className={styles.sectionIntro}>
                Add a JD, CV, subjects, or notes. At least one source is
                required; combine them for more context.
              </p>
              <div className={styles.twoColumns}>
                <label>
                  Document type
                  <select
                    value={source}
                    onChange={(event) =>
                      setSource(event.target.value as "jd" | "cv")
                    }
                  >
                    <option value="jd">Job description (JD)</option>
                    <option value="cv">Curriculum vitae (CV)</option>
                  </select>
                </label>
                <label>
                  Target level
                  <select
                    value={level}
                    onChange={(event) =>
                      setLevel(event.target.value as InterviewSetup["level"])
                    }
                  >
                    {levels.map((value) => (
                      <option value={value} key={value}>
                        {value[0].toUpperCase() + value.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={styles.upload}>
                JD or CV file (optional)
                <input
                  aria-label="JD or CV file"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void extract(file);
                  }}
                />
                <small>PDF or DOCX · up to 5 MB · text-based documents</small>
              </label>
              <p className={styles.hint}>
                Upload a JD, a CV, or both. Change Document type before
                uploading each. You can also skip documents and choose subjects
                or notes below.
              </p>
              {documents.length > 0 && (
                <ul className={styles.chips} aria-label="Uploaded documents">
                  {documents.map((document) => (
                    <li key={document.source}>
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Edit ${document.source.toUpperCase()}`}
                        onClick={() => setSource(document.source)}
                      >
                        {document.source.toUpperCase()} · {document.filename}
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        aria-label={`Remove ${document.source.toUpperCase()}`}
                        onClick={() =>
                          setDocuments((previous) =>
                            previous.filter(
                              (item) => item.source !== document.source,
                            ),
                          )
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {filename && (
                <label>
                  Review document text <small>{filename}</small>
                  <textarea
                    aria-label="Review document text"
                    value={documentText}
                    onChange={(event) =>
                      setDocuments((previous) =>
                        previous.map((document) =>
                          document.source === source
                            ? { ...document, text: event.target.value }
                            : document,
                        ),
                      )
                    }
                    rows={7}
                  />
                  <span className={styles.hint}>
                    Correct extraction errors before continuing.{" "}
                    {documentText.length.toLocaleString()} characters.
                  </span>
                </label>
              )}
            </fieldset>
            <fieldset disabled={loading || busy} className={styles.fieldset}>
              <legend>
                <span className={styles.step}>02</span> Set your focus
              </legend>
              <p className={styles.sectionIntro}>
                Optional: choose subjects or notes to focus the interview.
                Required only when no JD or CV is uploaded.
              </p>
              <LibraryPicker selected={selected} onChange={setSelected} />
            </fieldset>
            <fieldset disabled={loading || busy} className={styles.fieldset}>
              <legend>
                <span className={styles.step}>03</span> Make it yours
              </legend>
              <div className={styles.twoColumns}>
                <label>
                  Interview language
                  <select
                    value={lang}
                    onChange={(event) => {
                      setLang(event.target.value as "en" | "vi");
                      chooseVoice("", "Automatic");
                    }}
                  >
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label>
                  AI provider
                  <select
                    value={provider}
                    onChange={(event) => {
                      setProvider(
                        event.target.value as InterviewSetup["provider"],
                      );
                      chooseVoice("", "Automatic");
                    }}
                    disabled={!availability}
                  >
                    <option
                      value="deepseek"
                      disabled={!availability?.deepseek.available}
                    >
                      DeepSeek
                      {availability && !availability.deepseek.available
                        ? " · not configured"
                        : ""}
                    </option>
                    <option
                      value="openai"
                      disabled={!availability?.openai.available}
                    >
                      OpenAI
                      {availability && !availability.openai.available
                        ? " · not configured"
                        : ""}
                    </option>
                  </select>
                </label>
                <label>
                  Duration
                  <select
                    value={durationMinutes}
                    onChange={(event) =>
                      setDurationMinutes(Number(event.target.value))
                    }
                  >
                    {[10, 20, 30, 45].map((value) => (
                      <option value={value} key={value}>
                        {value} minutes
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <VoicePicker
                provider={provider}
                lang={lang}
                value={voice}
                onChange={chooseVoice}
              />
              {availability && !availability[provider].available && (
                <p className={styles.hint}>
                  {availability[provider].reason ||
                    "Ask the administrator to configure this provider’s API key."}
                </p>
              )}
              {providerError && (
                <p role="alert">
                  {providerError}{" "}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void loadProviders()}
                  >
                    Retry providers
                  </button>
                </p>
              )}
            </fieldset>
            <div className={styles.formFooter}>
              <span
                className={styles.hint}
                id="interview-review-hint"
                role="status"
                aria-live="polite"
              >
                {reviewBlocker || "Ready to review your interview brief."}
              </span>
              <button
                type="submit"
                disabled={!canReview || busy}
                aria-describedby="interview-review-hint"
              >
                Review interview
              </button>
            </div>
          </form>
          <aside className={styles.aside}>
            <p className={styles.eyebrow}>
              A little preparation goes a long way
            </p>
            <h3>
              A rehearsal
              <br />
              for the real thing.
            </h3>
            <div className={styles.rule} />
            <p>
              Questions drawn from your JD or CV and the subjects you choose.
              Follow-ups that listen to your answers.
            </p>
            <ol>
              <li>Bring specific examples.</li>
              <li>Explain your reasoning.</li>
              <li>Take time to think.</li>
            </ol>
            <p className={styles.hint}>
              You’ll receive a saved transcript and feedback on correctness,
              depth, clarity, and examples.
            </p>
            {interview.savedId && (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => void interview.restore()}
              >
                Open last interview
              </button>
            )}
          </aside>
        </div>
      )}
      {!session && brief && (
        <section className={styles.paper}>
          <p className={styles.eyebrow}>Ready when you are</p>
          <h3 className={styles.sectionTitle}>Your interview brief</h3>
          <div className={styles.briefMeta}>
            {brief.setup.documents?.map((document) => (
              <span key={document.source}>
                {document.source.toUpperCase()} · {document.filename}
              </span>
            ))}
            {!brief.setup.documents?.length && (
              <span>Library context only</span>
            )}
            <span>{brief.setup.level}</span>
            <span>{brief.setup.lang === "en" ? "English" : "Tiếng Việt"}</span>
            <span>{providerName(brief.setup.provider)}</span>
            <span>{brief.setup.durationMinutes} min</span>
            <span>Voice · {brief.voiceLabel}</span>
          </div>
          <h2 className={styles.smallHeading}>Selected subjects</h2>
          <p>
            {brief.context.subjects
              .map((subject) => subject.name)
              .join(" · ") ||
              (brief.context.notes.length
                ? "Individual notes"
                : "No library materials selected.")}
          </p>
          <h2 className={styles.smallHeading}>
            Resolved notes · {brief.context.notes.length}
          </h2>
          <ul className={styles.sourceList}>
            {brief.context.notes.map((note) => (
              <li key={note.id}>
                <strong>{note.title}</strong>
                <details>
                  <summary>Read source note</summary>
                  <p>{note.body}</p>
                </details>
              </li>
            ))}
          </ul>
          {brief.setup.documents?.map((document) => (
            <details className={styles.documentPreview} key={document.source}>
              <summary>Review {document.source.toUpperCase()} text</summary>
              <p>{document.text}</p>
            </details>
          ))}
          <p className={styles.hint}>
            {brief.context.characters.toLocaleString()} context characters.
            These materials are shared with {providerName(brief.setup.provider)}{" "}
            when you start. Questions and feedback use your selected language.
          </p>
          <div className={styles.notice}>
            {brief.setup.provider === "deepseek" ? (
              <p>
                DeepSeek uses browser speech recognition and voice playback.
                Recognition may send audio to your browser vendor. Availability
                depends on your browser and language. You control when each
                answer is submitted.
              </p>
            ) : (
              <p>
                OpenAI receives microphone audio directly for a live voice
                conversation. Typed answers are also supported. The
                interviewer’s voice is AI-generated.
              </p>
            )}
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={textOnly}
                onChange={(event) => setTextOnly(event.target.checked)}
                disabled={busy}
              />
              Start with typed answers (no microphone)
            </label>
          </div>
          <div className={styles.formFooter}>
            <button
              type="button"
              className="ghost"
              disabled={busy}
              onClick={() => {
                setBrief(null);
                setError("");
              }}
            >
              Edit brief
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void interview.start(brief.setup, textOnly)}
            >
              {busy ? "Starting…" : "Start interview"}
            </button>
          </div>
        </section>
      )}
      {session && (
        <LiveInterview
          interview={interview}
          recognition={recognition}
          onReset={() => {
            interview.reset();
            setBrief(null);
          }}
        />
      )}
    </main>
  );
}
