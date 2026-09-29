'use client';

import { AuthGate } from '@/components/AuthGate';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

type Topic = { id: string; name: string; slug: string; parentId: string | null };

function TopicsInner() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setTopics(await api<Topic[]>('/topics'));
  }

  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setError('');
    try {
      await api('/topics', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main>
      <h1>Chủ đề</h1>
      <div className="toolbar">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên chủ đề"
        />
        <button type="button" onClick={create}>
          Tạo
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {topics.length === 0 ? (
        <EmptyState message="Chưa có chủ đề" actionLabel="Tạo chủ đề" onAction={create} />
      ) : (
        <ul className="cards">
          {topics.map((t) => (
            <li key={t.id}>{t.name}</li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function TopicsPage() {
  return (
    <AuthGate>
      <TopicsInner />
    </AuthGate>
  );
}
