'use client';

import { AuthGate } from '@/components/AuthGate';
import { AiPanel } from '@/components/AiPanel';
import { EmptyState } from '@/components/EmptyState';
import { NoteEditor } from '@/components/NoteEditor';
import { QuestionForm } from '@/components/QuestionForm';
import { api, ApiError } from '@/lib/api';
import { AiAction, AiProvider, CreateQuestionBody } from '@kb/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Question = CreateQuestionBody & { id: string };
type NoteLink = { id: string; title: string };

const emptyForm: CreateQuestionBody = {
  prompt: '',
  choiceA: '',
  choiceB: '',
  choiceC: '',
  choiceD: '',
  correctChoice: 'A',
  explanationMarkdown: '',
};

function EditNote() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [form, setForm] = useState<CreateQuestionBody>(emptyForm);
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [lastAction, setLastAction] = useState<AiAction>('summarize');
  const [preview, setPreview] = useState('');
  const [aiError, setAiError] = useState('');
  const [notes, setNotes] = useState<NoteLink[]>([]);

  async function load() {
    const n = await api<{
      title: string;
      bodyMarkdown: string;
      questions: Question[];
    }>(`/notes/${id}`);
    setTitle(n.title);
    setBody(n.bodyMarkdown);
    setQuestions(n.questions ?? []);
  }

  useEffect(() => {
    void load();
    void api<{ items: NoteLink[] }>('/notes').then((data) => setNotes(data.items));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function save() {
    setError('');
    try {
      await api(`/notes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, bodyMarkdown: body }),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
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

  async function runAi(action: AiAction) {
    setLastAction(action);
    setAiError('');
    try {
      const result = await api<{ markdown?: string }>(`/notes/${id}/ai`, {
        method: 'POST',
        body: JSON.stringify({ action, provider }),
      });
      if (action === 'generate-questions') {
        setPreview('');
        await load();
        return;
      }
      setPreview(result.markdown ?? '');
    } catch (e) {
      setAiError(e instanceof ApiError ? e.message : 'AI lỗi');
    }
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
        />
      </section>
      <aside className="quiz">
        <h2>Câu hỏi</h2>
        {questions.length === 0 ? (
          <EmptyState message="Chưa có câu hỏi" actionLabel="Thêm câu hỏi" onAction={() => {}} />
        ) : (
          <ul className="question-list">
            {questions.map((q) => (
              <li key={q.id}>
                {q.prompt} — đúng: {q.correctChoice}{' '}
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
          lastAction={lastAction}
          onProviderChange={setProvider}
          preview={preview}
          error={aiError}
          onRun={runAi}
          onApply={applyPreview}
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
