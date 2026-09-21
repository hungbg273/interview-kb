'use client';

import { AuthGate } from '@/components/AuthGate';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Note = { id: string; title: string };
type Topic = { id: string; name: string };
type Tag = { id: string; name: string };

function NoteList() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [topicId, setTopicId] = useState('');
  const [tagId, setTagId] = useState('');
  const [items, setItems] = useState<Note[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  async function load() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (topicId) params.set('topicId', topicId);
    if (tagId) params.set('tagId', tagId);
    const qs = params.toString() ? `?${params}` : '';
    const data = await api<{ items: Note[] }>(`/notes${qs}`);
    setItems(data.items);
  }

  useEffect(() => {
    void api<Topic[]>('/topics').then(setTopics);
    void api<Tag[]>('/tags').then(setTags);
    void load();
    // First paint only: filters start empty so this lists every note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <div className="row">
        <h1>Ghi chú</h1>
        <button type="button" onClick={() => router.push('/notes/new')}>
          Tạo ghi chú
        </button>
      </div>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm" />
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Tất cả chủ đề</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
          <option value="">Tất cả tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void load()}>
          Tìm
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          message="Chưa có ghi chú"
          actionLabel="Tạo ghi chú"
          onAction={() => router.push('/notes/new')}
        />
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.id}>
              <a href={`/notes/${n.id}`}>{n.title}</a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <NoteList />
    </AuthGate>
  );
}
