'use client';

import { AuthGate } from '@/components/AuthGate';
import { AiPanel, type AiRunPayload } from '@/components/AiPanel';
import { EmptyState } from '@/components/EmptyState';
import { NoteEditor } from '@/components/NoteEditor';
import { QuestionForm } from '@/components/QuestionForm';
import { api, ApiError } from '@/lib/api';
import { AiDifficulty, AiLang, AiProvider, CreateQuestionBody } from '@kb/shared';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Question = CreateQuestionBody & { id: string };
type NoteLink = { id: string; title: string };
type TopicChip = { id: string; name: string };

const emptyForm: CreateQuestionBody = {
  prompt: '',
  choiceA: '',
  choiceB: '',
  choiceC: '',
  choiceD: '',
  correctChoice: 'A',
  explanationMarkdown: '',
  lang: 'vi',
};

function EditNote() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [form, setForm] = useState<CreateQuestionBody>(emptyForm);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [lastRun, setLastRun] = useState<AiRunPayload>({ action: 'summarize' });
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState<AiDifficulty>('medium');
  const [questionLang, setQuestionLang] = useState<AiLang>('vi');
  const [preview, setPreview] = useState('');
  const [aiError, setAiError] = useState('');
  const [notes, setNotes] = useState<NoteLink[]>([]);
  const [topics, setTopics] = useState<TopicChip[]>([]);
  const [topicQuery, setTopicQuery] = useState('');
  const [topicHits, setTopicHits] = useState<TopicChip[]>([]);

  async function load() {
    const n = await api<{
      title: string;
      bodyMarkdown: string;
      questions: Question[];
      topics?: TopicChip[];
    }>(`/notes/${id}`);
    setTitle(n.title);
    setBody(n.bodyMarkdown);
    setQuestions(n.questions ?? []);
    setTopics(n.topics ?? []);
  }

  useEffect(() => {
    void load();
    void api<{ items: NoteLink[] }>('/notes').then((data) => setNotes(data.items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const q = topicQuery.trim();
    if (!q) {
      setTopicHits([]);
      return;
    }
    let cancelled = false;
    void api<{ topics: TopicChip[] }>(`/search?q=${encodeURIComponent(q)}`).then((data) => {
      if (cancelled) return;
      const chosen = new Set(topics.map((t) => t.id));
      setTopicHits(data.topics.filter((t) => !chosen.has(t.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [topicQuery, topics]);

  async function save() {
    setError('');
    try {
      await api(`/notes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, bodyMarkdown: body, topicIds: topics.map((t) => t.id) }),
      });
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
      return false;
    }
  }

  async function addQuestion() {
    await api(`/notes/${id}/questions`, {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm(emptyForm);
    await load();
  }

  async function removeQuestion(qid: string) {
    await api(`/questions/${qid}`, { method: 'DELETE' });
    await load();
  }

  async function runAi(payload: AiRunPayload) {
    setLastRun(payload);
    setAiError('');
    try {
      const result = await api<{ markdown?: string }>(`/notes/${id}/ai`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, provider }),
      });
      if (payload.action === 'generate-questions') {
        setPreview('');
        await load();
        return;
      }
      setPreview(result.markdown ?? '');
    } catch (e) {
      setAiError(e instanceof ApiError ? e.message : 'AI lỗi');
    }
  }

  async function removeNote() {
    if (!window.confirm('Xóa ghi chú này?')) return;
    await api(`/notes/${id}`, { method: 'DELETE' });
    router.replace('/');
  }

  async function applyPreview() {
    await api(`/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ bodyMarkdown: preview }),
    });
    setBody(preview);
    setPreview('');
  }

  return (
    <main className="board">
      <aside className="rail">
        <h2>Ghi chú</h2>
        <ul className="rail-list">
          {notes.map((n) => (
            <li key={n.id}>
              <a className={n.id === id ? 'active' : ''} href={`/notes/${n.id}`}>
                {n.title || 'Không tiêu đề'}
              </a>
            </li>
          ))}
        </ul>
        <a href="/notes/new">+ Tạo mới</a>
      </aside>
      <section className="stage">
        <NoteEditor
          title={title}
          bodyMarkdown={body}
          onTitleChange={setTitle}
          onBodyChange={setBody}
          onSave={save}
          error={error}
          topics={topics}
          topicQuery={topicQuery}
          topicHits={topicHits}
          onTopicQueryChange={setTopicQuery}
          onAddTopic={(t) => {
            setTopics((prev) => [...prev, t]);
            setTopicQuery('');
            setTopicHits([]);
          }}
          onRemoveTopic={(tid) => setTopics((prev) => prev.filter((t) => t.id !== tid))}
        />
        <button type="button" className="ghost" onClick={() => void removeNote()}>
          Xóa ghi chú
        </button>
      </section>
      <aside className="quiz">
        <h2>Câu hỏi</h2>
        {questions.length === 0 ? (
          <EmptyState message="Chưa có câu hỏi" actionLabel="Thêm câu hỏi" onAction={() => {}} />
        ) : (
          <ul className="question-list">
            {questions.map((q) => (
              <li key={q.id}>
                {q.prompt} — đúng: {q.correctChoice} — {q.lang === 'en' ? 'EN' : 'VI'}{' '}
                <button type="button" className="ghost" onClick={() => removeQuestion(q.id)}>
                  Xoá
                </button>
              </li>
            ))}
          </ul>
        )}
        <QuestionForm value={form} onChange={setForm} onSubmit={addQuestion} />
        <AiPanel
          provider={provider}
          lastRun={lastRun}
          questionCount={questionCount}
          questionLang={questionLang}
          difficulty={difficulty}
          onQuestionCountChange={setQuestionCount}
          onQuestionLangChange={setQuestionLang}
          onDifficultyChange={setDifficulty}
          onProviderChange={setProvider}
          preview={preview}
          error={aiError}
          onRun={(payload) => void runAi(payload)}
          onApply={() => void applyPreview()}
          onDiscard={() => setPreview('')}
        />
      </aside>
    </main>
  );
}

export default function NotePage() {
  return (
    <AuthGate>
      <EditNote />
    </AuthGate>
  );
}
