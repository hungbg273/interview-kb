'use client';

import { api, ApiError } from '@/lib/api';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { NoteEditor } from '@/components/NoteEditor';

type NoteLink = { id: string; title: string };
type TopicChip = { id: string; name: string };

export function NewNote() {
  const router = useRouter();
  const params = useSearchParams();
  const createdId = useRef<string | null>(null);
  const presetTopicId = params.get('topicId');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notes, setNotes] = useState<NoteLink[]>([]);
  const [topics, setTopics] = useState<TopicChip[]>([]);
  const [topicQuery, setTopicQuery] = useState('');
  const [topicHits, setTopicHits] = useState<TopicChip[]>([]);

  useEffect(() => {
    void api<{ items: NoteLink[] }>('/notes').then((data) => setNotes(data.items));
  }, []);

  useEffect(() => {
    if (!presetTopicId) return;
    void api<{ id: string; name: string }>(`/topics/${presetTopicId}`).then((t) => {
      setTopics([{ id: t.id, name: t.name }]);
    });
  }, [presetTopicId]);

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
      const note = await api<{ id: string }>('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title,
          bodyMarkdown: body,
          topicIds: topics.map((t) => t.id),
        }),
      });
      createdId.current = note.id;
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
      return false;
    }
  }

  return (
    <main className="board">
      <aside className="rail">
        <h2>Ghi chú</h2>
        <ul className="rail-list">
          {notes.map((n) => (
            <li key={n.id}>
              <a href={`/notes/${n.id}`}>{n.title || 'Không tiêu đề'}</a>
            </li>
          ))}
        </ul>
      </aside>
      <section className="stage">
        <NoteEditor
          title={title}
          bodyMarkdown={body}
          onTitleChange={setTitle}
          onBodyChange={setBody}
          onSave={save}
          onSavedAck={() => {
            if (createdId.current) router.replace(`/notes/${createdId.current}`);
          }}
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
      </section>
      <aside className="quiz">
        <h2>Câu hỏi</h2>
        <p className="empty">Lưu ghi chú trước, rồi thêm câu hỏi ABCD ở cột này.</p>
      </aside>
    </main>
  );
}

export default function NewNotePage() {
  return (
    <AuthGate>
      <Suspense fallback={<main className="empty">Đang tải…</main>}>
        <NewNote />
      </Suspense>
    </AuthGate>
  );
}
