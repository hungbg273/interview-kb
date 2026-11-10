"use client";

import { useAiJobs } from "@/components/AiJobsProvider";
import { AiJobStatus } from "@/components/AiJobStatus";
import { activeJob } from "@/lib/ai-jobs";
import type { AiJobResult } from "@kb/shared";
import { ChatgptConnectionPanel } from "@/components/ChatgptConnectionPanel";
import { api } from "@/lib/api";
import { AiLang } from "@kb/shared";
import { useEffect, useState, useRef } from "react";

import { PracticeRunner } from "./PracticeRunner";
import type { PracticeAttemptView, AiProvider } from "@kb/shared";

type Chip = { id: string; label: string };
type SearchHits = { notes: Chip[]; topics: Chip[] };
type QuizQuestion = {
  type?: "mcq" | "essay";
  id: string;
  prompt: string;
  choiceA?: string | null;
  choiceB?: string | null;
  choiceC?: string | null;
  choiceD?: string | null;
  suggestedTopics?: string[];
  draftId?: string;
};
type KeepState = {
  keep: boolean;
  note: Chip | null;
  topicNames: string;
};
type DraftBundle = { draftId: string; items: QuizQuestion[] };

const levels = ["fresher", "junior", "middle", "senior", "expert"] as const;

function emptyKeep(item: QuizQuestion): KeepState {
  return {
    keep: false,
    note: null,
    topicNames: (item.suggestedTopics ?? []).join(", "),
  };
}

function addChip(list: Chip[], hit: Chip) {
  return list.some((item) => item.id === hit.id) ? list : [...list, hit];
}

function Practice() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHits>({ notes: [], topics: [] });
  const [pickedNotes, setPickedNotes] = useState<Chip[]>([]);
  const [pickedTopics, setPickedTopics] = useState<Chip[]>([]);
  const [useCv, setUseCv] = useState(false);
  const [useJd, setUseJd] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [mcqCount, setMcqCount] = useState(6),
    [essayCount, setEssayCount] = useState(4);
  const [availability, setAvailability] = useState<{
    mcq: number;
    essay: number;
    providers: Record<AiProvider, boolean>;
  } | null>(null);
  const [provider, setProvider] = useState<AiProvider>("chatgpt");
  const [attempt, setAttempt] = useState<PracticeAttemptView | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const startGuard = useRef(false);
  const savedKeeps = useRef(new Map<string, string>());
  const request = useRef<{ payload: string; key: string } | null>(null);
  const limit = mcqCount + essayCount;
  const validCounts =
    Number.isInteger(mcqCount) &&
    Number.isInteger(essayCount) &&
    mcqCount >= 0 &&
    essayCount >= 0 &&
    limit >= 1 &&
    limit <= 50;
  useEffect(() => {
    let live = true;
    api<{ email: string }>("/auth/me")
      .then((me) => {
        if (!live || !me?.email) return;
        const key = "practice-attempt:" + me.email;
        setStorageKey(key);
        try {
          setResumeId(localStorage.getItem(key));
        } catch {}
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (attempt && storageKey) {
      try {
        localStorage.setItem(storageKey, attempt.id);
      } catch {}
    }
  }, [attempt, storageKey]);
  async function createAttempt(draftIds: string[] = []) {
    const body = {
      noteIds: pickedNotes.map((n) => n.id),
      topicIds: pickedTopics.map((t) => t.id),
      draftIds,
      mcqCount,
      essayCount,
      lang,
      ...(essayCount ? { provider } : {}),
    };
    const payload = JSON.stringify(body);
    if (request.current?.payload !== payload)
      request.current = { payload, key: crypto.randomUUID() };
    const next = await api<PracticeAttemptView>("/practice/attempts", {
      method: "POST",
      body: JSON.stringify({ ...body, requestKey: request.current.key }),
    });
    setAttempt(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, next.id);
      } catch {}
    }
    setPhase("quiz");
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("attempt");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      api<PracticeAttemptView>(`/practice/attempts/${id}`)
        .then((next) => {
          setAttempt(next);
          setPhase("quiz");
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Không mở được bài."),
        );
    }
  }, []);
  async function resume() {
    if (!resumeId) return;
    try {
      setAttempt(
        await api<PracticeAttemptView>(`/practice/attempts/${resumeId}`),
      );
      setPhase("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không mở được bài.");
    }
  }

  const [lang, setLang] = useState<AiLang>("vi");
  const [level, setLevel] = useState<(typeof levels)[number]>("junior");
  const [drafts, setDrafts] = useState<DraftBundle[]>([]);
  const [draftItems, setDraftItems] = useState<QuizQuestion[]>([]);
  const [keeps, setKeeps] = useState<Record<string, KeepState>>({});
  const [phase, setPhase] = useState<"setup" | "review" | "quiz" | "results">(
    "setup",
  );
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState("");
  const fromDoc = useCv || useJd;
  const hasPool = pickedNotes.length > 0 || pickedTopics.length > 0;
  useEffect(() => {
    let cancelled = false;
    setAvailability(null);
    const query = new URLSearchParams({ lang });
    pickedNotes.forEach((n) => query.append("noteId", n.id));
    pickedTopics.forEach((t) => query.append("topicId", t.id));
    api<{ mcq: number; essay: number; providers: Record<AiProvider, boolean> }>(
      `/practice/attempts/options?${query}`,
    )
      .then((data) => {
        if (!cancelled) setAvailability(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pickedNotes, pickedTopics, lang]);
  const noteHits = hits.notes.filter(
    (hit) => !pickedNotes.some((item) => item.id === hit.id),
  );
  const topicHits = hits.topics.filter(
    (hit) => !pickedTopics.some((item) => item.id === hit.id),
  );
  const showDropdown =
    phase === "setup" && (noteHits.length > 0 || topicHits.length > 0);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits({ notes: [], topics: [] });
      return;
    }
    let cancelled = false;
    void api<{
      topics: Array<{ id: string; name: string }>;
      notes: Array<{ id: string; title: string }>;
    }>(`/search?q=${encodeURIComponent(query)}`).then((data) => {
      if (cancelled) return;
      setHits({
        notes: data.notes.map((n) => ({ id: n.id, label: n.title })),
        topics: data.topics.map((t) => ({ id: t.id, label: t.name })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  function closeSearch() {
    setQ("");
    setHits({ notes: [], topics: [] });
  }

  function pickNote(hit: Chip) {
    setPickedNotes((prev) => addChip(prev, hit));
    closeSearch();
  }

  function pickTopic(hit: Chip) {
    setPickedTopics((prev) => addChip(prev, hit));
    closeSearch();
  }

  const { jobs, selectedJobId, selectionVersion, submitImport } = useAiJobs();
  const [importJobIds, setImportJobIds] = useState<string[]>([]);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const importJobs = jobs.filter((job) => importJobIds.includes(job.id));
  useEffect(() => {
    if (
      jobs.some(
        (job) => job.id === selectedJobId && job.action === "import-document",
      )
    )
      setPhase("setup");
  }, [selectedJobId, selectionVersion]);
  useEffect(() => {
    if (
      jobs.some(
        (job) => job.id === selectedJobId && job.action === "import-document",
      )
    )
      setImportJobIds((ids) =>
        ids.includes(selectedJobId!) ? ids : [selectedJobId!],
      );
  }, [selectedJobId, jobs]);
  async function openImportResults() {
    if (!importJobIds.length) return;
    const bundles: DraftBundle[] = [];
    for (const id of importJobIds.filter((id) =>
      jobs.some((job) => job.id === id && job.status === "succeeded"),
    )) {
      const data = await api<AiJobResult>(`/ai-jobs/${id}/result`);
      if (!data.draftId || !data.items)
        throw new Error("Chưa có câu hỏi tài liệu.");
      bundles.push({
        draftId: data.draftId,
        items: data.items.map((item) => ({ ...item, draftId: data.draftId })),
      });
    }
    if (!bundles.length) throw new Error("Chưa có tài liệu xử lý xong.");
    const nextItems = bundles.flatMap((bundle) => bundle.items);
    setDrafts(bundles);
    setDraftItems(nextItems);
    setKeeps(
      Object.fromEntries(nextItems.map((item) => [item.id, emptyKeep(item)])),
    );
    setPhase("review");
  }
  async function postImport(source: "cv" | "jd", file: File | null) {
    const body = new FormData();
    body.append("source", source);
    body.append("lang", lang);
    body.append("level", level);
    body.append("mcqCount", String(mcqCount));
    body.append("essayCount", String(essayCount));
    if (file) body.append("file", file);
    return submitImport(body);
  }

  async function generateFromDoc() {
    if (importSubmitting || importJobs.some(activeJob)) return;
    setImportSubmitting(true);
    setError("");
    setImportJobIds([]);
    try {
      if (useCv) {
        const job = await postImport("cv", cvFile);
        setImportJobIds((ids) => [...new Set([...ids, job.id])]);
      }
      if (useJd) {
        const job = await postImport("jd", jdFile);
        setImportJobIds((ids) => [...new Set([...ids, job.id])]);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không gửi được yêu cầu tạo câu hỏi.",
      );
    } finally {
      setImportSubmitting(false);
    }
  }

  async function startFromPool() {
    if (!hasPool || startGuard.current) return;
    startGuard.current = true;
    setStarting(true);
    setError("");
    try {
      await createAttempt();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bắt đầu được");
    } finally {
      startGuard.current = false;
      setStarting(false);
    }
  }

  async function startFromReview() {
    if (startGuard.current) return;
    startGuard.current = true;
    setStarting(true);
    const selected = draftItems.filter(
      (item) => keeps[item.id]?.keep && keeps[item.id]?.note,
    );
    setError("");
    try {
      for (const bundle of drafts) {
        const kept = selected.filter((item) => item.draftId === bundle.draftId);

        const keepBody = JSON.stringify({
          keeps: kept.map((item) => ({
            questionId: item.id,
            noteId: keeps[item.id].note!.id,
            topicNames: keeps[item.id].topicNames
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean),
          })),
        });
        if (savedKeeps.current.get(bundle.draftId) !== keepBody) {
          await api(`/practice/imports/${bundle.draftId}`, {
            method: "PATCH",
            body: keepBody,
          });
          savedKeeps.current.set(bundle.draftId, keepBody);
        }
      }
      await createAttempt(drafts.map((d) => d.draftId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không bắt đầu được");
    } finally {
      startGuard.current = false;
      setStarting(false);
    }
  }

  function reset() {
    setAttempt(null);
    setResumeId(null);
    request.current = null;
    savedKeeps.current.clear();
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
    setPhase("setup");
    setEmpty(false);
    setError("");
    setPickedNotes([]);
    setPickedTopics([]);
    setUseCv(false);
    setUseJd(false);
    setQ("");
    setHits({ notes: [], topics: [] });
    setCvFile(null);
    setJdFile(null);
    setDrafts([]);
    setDraftItems([]);
    setKeeps({});
  }

  const canStartReview = draftItems.length > 0 || hasPool;

  return (
    <main className="practice">
      {phase === "setup" && (
        <section className="sheet">
          <h1>Luyện tập</h1>
          {resumeId && (
            <button onClick={() => void resume()}>Tiếp tục bài đang làm</button>
          )}
          <p className="kicker">
            Kết hợp ghi chú, chủ đề hoặc CV/JD để chuẩn bị bài luyện tập.
          </p>
          {importJobs.map((job) => (
            <AiJobStatus key={job.id} job={job} onResult={openImportResults} />
          ))}
          <section className="practice-section" aria-labelledby="practice-sources">
          <h2 id="practice-sources">Nguồn kiến thức</h2>
          <div className="search-field">
            <label htmlFor="practice-search">Tìm trong thư viện</label>
            <input
              id="practice-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm ghi chú hoặc chủ đề"
            />
            {showDropdown && (
              <div className="search-overlay">
                {noteHits.length > 0 && (
                  <>
                    <h2>Ghi chú</h2>
                    {noteHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        className="ghost"
                        onClick={() => pickNote(hit)}
                      >
                        {hit.label}
                      </button>
                    ))}
                  </>
                )}
                {topicHits.length > 0 && (
                  <>
                    <h2>Chủ đề</h2>
                    {topicHits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        className="ghost"
                        onClick={() => pickTopic(hit)}
                      >
                        {hit.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          {(pickedNotes.length > 0 || pickedTopics.length > 0) && (
            <div className="chips">
              {pickedNotes.map((note) => (
                <span key={note.id} className="chip">
                  Ghi chú: {note.label}
                  <button
                    type="button"
                    className="ghost"
                    aria-label={`Bỏ ${note.label}`}
                    onClick={() =>
                      setPickedNotes((prev) =>
                        prev.filter((item) => item.id !== note.id),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {pickedTopics.map((topic) => (
                <span key={topic.id} className="chip">
                  Chủ đề: {topic.label}
                  <button
                    type="button"
                    className="ghost"
                    aria-label={`Bỏ ${topic.label}`}
                    onClick={() =>
                      setPickedTopics((prev) =>
                        prev.filter((item) => item.id !== topic.id),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="sources">
            <label>
              <input
                type="checkbox"
                checked={useCv}
                onChange={(e) => setUseCv(e.target.checked)}
              />{" "}
              Từ CV
            </label>
            <label>
              <input
                type="checkbox"
                checked={useJd}
                onChange={(e) => setUseJd(e.target.checked)}
              />{" "}
              Từ JD
            </label>
          </div>
          </section>
          <section className="practice-section" aria-labelledby="practice-settings">
          <h2 id="practice-settings">Cấu hình bài</h2>
          <div className="form-grid">
            <label>
              Trắc nghiệm
              <input
                type="number"
                min={0}
                max={50}
                value={mcqCount}
                onChange={(e) => setMcqCount(Number(e.target.value))}
              />
            </label>
            <label>
              Tự luận
              <input
                type="number"
                min={0}
                max={50}
                value={essayCount}
                onChange={(e) => setEssayCount(Number(e.target.value))}
              />
            </label>
            <p>Tổng: {limit} câu (1–50)</p>
            {hasPool && availability && (
              <p>
                Trong thư viện đã chọn: {availability.mcq} trắc nghiệm,{" "}
                {availability.essay} tự luận.
              </p>
            )}
            {essayCount > 0 && (
              <label>
                AI chấm tự luận
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as AiProvider)}
                >
                  {(["chatgpt", "openai", "deepseek"] as const).map((p) => (
                    <option
                      key={p}
                      value={p}
                      disabled={availability?.providers[p] === false}
                    >
                      {p}
                      {availability?.providers[p] === false
                        ? " — chưa kết nối"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Ngôn ngữ
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as AiLang)}
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
          {fromDoc && (
            <div className="form-grid">
              <label>
                Cấp
                <select
                  value={level}
                  onChange={(e) =>
                    setLevel(e.target.value as (typeof levels)[number])
                  }
                >
                  {levels.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              {useCv && (
                <label>
                  File PDF hoặc Word (CV)
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              {useJd && (
                <label>
                  File PDF hoặc Word (JD)
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setJdFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          )}
          <details className="practice-advanced">
            <summary>Kết nối AI</summary>
          {(useCv || useJd || (essayCount > 0 && provider === "chatgpt")) && (
            <ChatgptConnectionPanel />
          )}
          </details>
          </section>
          <section className="practice-section" aria-labelledby="practice-start">
          <h2 id="practice-start">Bắt đầu luyện tập</h2>
          <p className="practice-summary">{mcqCount} câu trắc nghiệm · {essayCount} câu tự luận · {lang === 'vi' ? 'Tiếng Việt' : 'English'}</p>
          {!hasPool && !fromDoc && <p className="field-hint">Chọn ít nhất một ghi chú hoặc chủ đề ở phần Nguồn kiến thức.</p>}
          {fromDoc && (
            <button
              type="button"
              disabled={
                importSubmitting || importJobs.some(activeJob) || !validCounts
              }
              onClick={() => void generateFromDoc()}
            >
              Sinh câu hỏi
            </button>
          )}
          {!fromDoc && (
            <button
              type="button"
              disabled={!hasPool || !validCounts || starting}
              onClick={() => void startFromPool()}
            >
              Bắt đầu
            </button>
          )}
          {essayCount > 0 && availability?.providers[provider] === false && (
            <p className="field-hint">
              Hãy kết nối hoặc chọn một AI khả dụng để chấm tự luận.
            </p>
          )}
          {empty && <p className="empty">Chưa có câu hỏi cho lựa chọn này</p>}
          {error && <p className="banner" role="alert">{error}</p>}
          </section>
        </section>
      )}

      {phase === "review" && (
        <section className="sheet">
          <h1>Chọn câu giữ lại</h1>
          <p>
            Các câu trong tài liệu được dùng để luyện tập. Chọn Giữ và ghi chú
            đích nếu muốn lưu vào thư viện.
          </p>
          <div className="search-field">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm ghi chú để gán"
            />
          </div>
          <ul className="question-list">
            {draftItems.map((item) => {
              const state = keeps[item.id] ?? emptyKeep(item);
              return (
                <li key={item.id}>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={state.keep}
                        onChange={(e) =>
                          setKeeps((prev) => ({
                            ...prev,
                            [item.id]: { ...state, keep: e.target.checked },
                          }))
                        }
                      />{" "}
                      Giữ
                    </label>
                    <p>{item.prompt}</p>
                    {item.type === "essay" ? (
                      <p>Tự luận</p>
                    ) : (
                      <p>
                        A. {item.choiceA} / B. {item.choiceB} / C.{" "}
                        {item.choiceC} / D. {item.choiceD}
                      </p>
                    )}
                    <label>
                      Chủ đề
                      <input
                        value={state.topicNames}
                        onChange={(e) =>
                          setKeeps((prev) => ({
                            ...prev,
                            [item.id]: { ...state, topicNames: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <p>
                      {state.note
                        ? `Ghi chú: ${state.note.label}`
                        : "Chưa chọn ghi chú"}
                    </p>
                    {hits.notes.map((hit) => (
                      <button
                        key={`${item.id}-${hit.id}`}
                        type="button"
                        className="ghost"
                        onClick={() =>
                          setKeeps((prev) => ({
                            ...prev,
                            [item.id]: { ...state, note: hit, keep: true },
                          }))
                        }
                      >
                        Gán {hit.label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={!canStartReview || !validCounts || starting}
            onClick={() => void startFromReview()}
          >
            Bắt đầu
          </button>
          {empty && <p className="empty">Chưa có câu hỏi cho lựa chọn này</p>}
          {error && <p className="banner">{error}</p>}
        </section>
      )}

      {phase === "quiz" && attempt && (
        <PracticeRunner key={attempt.id} initial={attempt} onExit={reset} />
      )}
    </main>
  );
}

export default function PracticePage() {
  return (
    <>
      <Practice />
    </>
  );
}
