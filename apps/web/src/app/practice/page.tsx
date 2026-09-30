'use client';

import { AuthGate } from '@/components/AuthGate';
import { api, ApiError } from '@/lib/api';
import { AiLang } from '@kb/shared';
import { useEffect, useState } from 'react';

type Chip = { id: string; label: string };
type SearchHits = { notes: Chip[]; topics: Chip[] };
type QuizQuestion = {
  id: string;
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  suggestedTopics?: string[];
  draftId?: string;
};
type GradeItem = {
  questionId: string;
  prompt: string;
  choice: string;
  correctChoice: string;
  ok: boolean;
  explanationMarkdown: string | null;
};
type GradeResult = { total: number; correct: number; items: GradeItem[] };
type KeepState = {
  keep: boolean;
  note: Chip | null;
  topicNames: string;
};
type DraftBundle = { draftId: string; items: QuizQuestion[] };

const letters = ['A', 'B', 'C', 'D'] as const;
const levels = ['fresher', 'junior', 'middle', 'senior', 'expert'] as const;

function emptyKeep(item: QuizQuestion): KeepState {
  return {
    keep: false,
    note: null,
    topicNames: (item.suggestedTopics ?? []).join(', '),
  };
}

function addChip(list: Chip[], hit: Chip) {
  return list.some((item) => item.id === hit.id) ? list : [...list, hit];
}

function mergeGrades(parts: GradeResult[], order: string[]): GradeResult {
  const byId = new Map(parts.flatMap((part) => part.items.map((item) => [item.questionId, item])));
  const items = order.map((id) => byId.get(id)).filter((item): item is GradeItem => Boolean(item));
  return {
    total: items.length,
    correct: items.filter((item) => item.ok).length,
    items,
  };
}

function Practice() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHits>({ notes: [], topics: [] });
  const [pickedNotes, setPickedNotes] = useState<Chip[]>([]);
  const [pickedTopics, setPickedTopics] = useState<Chip[]>([]);
  const [useCv, setUseCv] = useState(false);
  const [useJd, setUseJd] = useState(false);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [limit, setLimit] = useState(10);
  const [lang, setLang] = useState<AiLang>('vi');
  const [level, setLevel] = useState<(typeof levels)[number]>('junior');
  const [drafts, setDrafts] = useState<DraftBundle[]>([]);
  const [draftItems, setDraftItems] = useState<QuizQuestion[]>([]);
  const [keeps, setKeeps] = useState<Record<string, KeepState>>({});
  const [phase, setPhase] = useState<'setup' | 'review' | 'quiz' | 'results'>('setup');
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Array<{ questionId: string; choice: string }>>([]);
  const [result, setResult] = useState<GradeResult | null>(null);

  const fromDoc = useCv || useJd;
  const hasPool = pickedNotes.length > 0 || pickedTopics.length > 0;
  const noteHits = hits.notes.filter((hit) => !pickedNotes.some((item) => item.id === hit.id));
  const topicHits = hits.topics.filter((hit) => !pickedTopics.some((item) => item.id === hit.id));
  const showDropdown = phase === 'setup' && (noteHits.length > 0 || topicHits.length > 0);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits({ notes: [], topics: [] });
      return;
    }
    let cancelled = false;
    void api<{ topics: Array<{ id: string; name: string }>; notes: Array<{ id: string; title: string }> }>(
      `/search?q=${encodeURIComponent(query)}`,
    ).then((data) => {
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
    setQ('');
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

  async function fetchPool() {
    const params = new URLSearchParams();
    for (const note of pickedNotes) params.append('noteId', note.id);
    for (const topic of pickedTopics) params.append('topicId', topic.id);
    params.set('limit', String(limit));
    params.set('lang', lang);
    return api<{ items: QuizQuestion[] }>(`/practice/questions?${params.toString()}`);
  }

  async function postImport(source: 'cv' | 'jd', file: File | null) {
    const body = new FormData();
    body.append('source', source);
    body.append('lang', lang);
    body.append('level', level);
    if (file) body.append('file', file);
    return api<{ draftId: string; items: QuizQuestion[] }>('/practice/imports', {
      method: 'POST',
      body,
    });
  }

  async function generateFromDoc() {
    setError('');
    try {
      const bundles: DraftBundle[] = [];
      if (useCv) {
        const data = await postImport('cv', cvFile);
        bundles.push({
          draftId: data.draftId,
          items: data.items.map((item) => ({ ...item, draftId: data.draftId })),
        });
      }
      if (useJd) {
        const data = await postImport('jd', jdFile);
        bundles.push({
          draftId: data.draftId,
          items: data.items.map((item) => ({ ...item, draftId: data.draftId })),
        });
      }
      const nextItems = bundles.flatMap((bundle) => bundle.items);
      setDrafts(bundles);
      setDraftItems(nextItems);
      setKeeps(Object.fromEntries(nextItems.map((item) => [item.id, emptyKeep(item)])));
      setPhase('review');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không sinh được câu hỏi');
    }
  }

  async function startFromPool() {
    if (!hasPool) return;
    setEmpty(false);
    setError('');
    try {
      const data = await fetchPool();
      if (data.items.length === 0) {
        setEmpty(true);
        return;
      }
      beginQuiz(data.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không bắt đầu được');
    }
  }

  async function startFromReview() {
    const selected = draftItems.filter((item) => keeps[item.id]?.keep && keeps[item.id]?.note);
    setError('');
    try {
      for (const bundle of drafts) {
        const kept = selected.filter((item) => item.draftId === bundle.draftId);
        if (kept.length === 0) continue;
        await api(`/practice/imports/${bundle.draftId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            keeps: kept.map((item) => ({
              questionId: item.id,
              noteId: keeps[item.id].note!.id,
              topicNames: keeps[item.id].topicNames
                .split(',')
                .map((name) => name.trim())
                .filter(Boolean),
            })),
          }),
        });
      }
      let pool: QuizQuestion[] = [];
      if (hasPool) {
        const data = await fetchPool();
        pool = data.items;
      }
      const nextItems = [...selected, ...pool];
      if (nextItems.length === 0) {
        setEmpty(true);
        return;
      }
      beginQuiz(nextItems);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không bắt đầu được');
    }
  }

  function beginQuiz(nextItems: QuizQuestion[]) {
    setItems(nextItems);
    setIndex(0);
    setChoice(null);
    setAnswers([]);
    setResult(null);
    setPhase('quiz');
  }

  async function commitChoice() {
    if (!choice) return;
    const current = items[index];
    const nextAnswers = [...answers, { questionId: current.id, choice }];
    if (index + 1 < items.length) {
      setAnswers(nextAnswers);
      setIndex(index + 1);
      setChoice(null);
      return;
    }
    try {
      const byDraft = new Map<string, typeof nextAnswers>();
      const poolAnswers: typeof nextAnswers = [];
      for (const answer of nextAnswers) {
        const question = items.find((item) => item.id === answer.questionId);
        if (question?.draftId) {
          const group = byDraft.get(question.draftId) ?? [];
          group.push(answer);
          byDraft.set(question.draftId, group);
        } else {
          poolAnswers.push(answer);
        }
      }
      const parts: GradeResult[] = [];
      for (const [draftId, draftAnswers] of byDraft) {
        parts.push(
          await api<GradeResult>(`/practice/imports/${draftId}/grade`, {
            method: 'POST',
            body: JSON.stringify({ answers: draftAnswers }),
          }),
        );
      }
      if (poolAnswers.length > 0) {
        parts.push(
          await api<GradeResult>('/practice/grade', {
            method: 'POST',
            body: JSON.stringify({ answers: poolAnswers }),
          }),
        );
      }
      setResult(mergeGrades(parts, nextAnswers.map((answer) => answer.questionId)));
      setPhase('results');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không chấm được');
    }
  }

  function reset() {
    setPhase('setup');
    setEmpty(false);
    setError('');
    setItems([]);
    setResult(null);
    setPickedNotes([]);
    setPickedTopics([]);
    setUseCv(false);
    setUseJd(false);
    setQ('');
    setHits({ notes: [], topics: [] });
    setCvFile(null);
    setJdFile(null);
    setDrafts([]);
    setDraftItems([]);
    setKeeps({});
  }

  const current = items[index];
  const canStartDraft = draftItems.some((item) => keeps[item.id]?.keep && keeps[item.id]?.note);
  const canStartReview = canStartDraft || hasPool;

  return (
    <main className="practice">
      {phase === 'setup' && (
        <section className="sheet">
          <h1>Luyện tập</h1>
          <p className="kicker">Chọn ghi chú, chủ đề, hoặc tải CV/JD — có thể mix.</p>
          <div className="search-field">
            <input
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
                      <button key={hit.id} type="button" className="ghost" onClick={() => pickNote(hit)}>
                        {hit.label}
                      </button>
                    ))}
                  </>
                )}
                {topicHits.length > 0 && (
                  <>
                    <h2>Chủ đề</h2>
                    {topicHits.map((hit) => (
                      <button key={hit.id} type="button" className="ghost" onClick={() => pickTopic(hit)}>
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
                    onClick={() => setPickedNotes((prev) => prev.filter((item) => item.id !== note.id))}
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
                    onClick={() => setPickedTopics((prev) => prev.filter((item) => item.id !== topic.id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="sources">
            <label>
              <input type="checkbox" checked={useCv} onChange={(e) => setUseCv(e.target.checked)} /> Từ CV
            </label>
            <label>
              <input type="checkbox" checked={useJd} onChange={(e) => setUseJd(e.target.checked)} /> Từ JD
            </label>
          </div>
          <div className="form-grid">
            <label>
              Số câu
              <input
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>
            <label>
              Ngôn ngữ
              <select value={lang} onChange={(e) => setLang(e.target.value as AiLang)}>
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
                  onChange={(e) => setLevel(e.target.value as (typeof levels)[number])}
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
          {fromDoc && (
            <button type="button" onClick={() => void generateFromDoc()}>
              Sinh câu hỏi
            </button>
          )}
          {!fromDoc && (
            <button type="button" disabled={!hasPool} onClick={() => void startFromPool()}>
              Bắt đầu
            </button>
          )}
          {empty && <p className="empty">Chưa có câu hỏi cho lựa chọn này</p>}
          {error && <p className="banner">{error}</p>}
        </section>
      )}

      {phase === 'review' && (
        <section className="sheet">
          <h1>Chọn câu giữ lại</h1>
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
                      />{' '}
                      Giữ
                    </label>
                    <p>{item.prompt}</p>
                    <p>
                      A. {item.choiceA} / B. {item.choiceB} / C. {item.choiceC} / D. {item.choiceD}
                    </p>
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
                    <p>{state.note ? `Ghi chú: ${state.note.label}` : 'Chưa chọn ghi chú'}</p>
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
          <button type="button" disabled={!canStartReview} onClick={() => void startFromReview()}>
            Bắt đầu
          </button>
          {empty && <p className="empty">Chưa có câu hỏi cho lựa chọn này</p>}
          {error && <p className="banner">{error}</p>}
        </section>
      )}

      {phase === 'quiz' && current && (
        <section className="sheet">
          <p className="kicker">
            Câu {index + 1} / {items.length}
          </p>
          <h1>{current.prompt}</h1>
          <div className="quiz-choices">
            {letters.map((letter) => {
              const text = {
                A: current.choiceA,
                B: current.choiceB,
                C: current.choiceC,
                D: current.choiceD,
              }[letter];
              return (
                <label key={letter}>
                  <input
                    type="radio"
                    name="choice"
                    value={letter}
                    checked={choice === letter}
                    onChange={() => setChoice(letter)}
                  />
                  {letter}. {text}
                </label>
              );
            })}
          </div>
          <button type="button" disabled={!choice} onClick={() => void commitChoice()}>
            {index + 1 < items.length ? 'Câu tiếp' : 'Nộp bài'}
          </button>
          {error && <p className="banner">{error}</p>}
        </section>
      )}

      {phase === 'results' && result && (
        <section className="sheet">
          <h1>
            Đúng {result.correct} / {result.total}
          </h1>
          <ul className="question-list">
            {result.items.map((item) => (
              <li key={item.questionId}>
                <div>
                  <p>{item.prompt}</p>
                  <p>
                    Bạn chọn {item.choice} — đáp án {item.correctChoice} —{' '}
                    {item.ok ? 'đúng' : 'sai'}
                  </p>
                  {item.explanationMarkdown && <p>{item.explanationMarkdown}</p>}
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={reset}>
            Làm đề khác
          </button>
        </section>
      )}
    </main>
  );
}

export default function PracticePage() {
  return (
    <AuthGate>
      <Practice />
    </AuthGate>
  );
}
