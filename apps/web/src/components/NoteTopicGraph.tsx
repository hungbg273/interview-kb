'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LocalTopicGraph, type GraphTopic } from './LocalTopicGraph';

export function NoteTopicGraph({topics, hasUnsavedChanges = false}: {topics: GraphTopic[]; hasUnsavedChanges?: boolean}) {
  const router = useRouter();
  const [chosen, setChosen] = useState('');
  const topic = topics.find(t=>t.id === chosen) ?? topics[0] ?? null;
  return <div className="note-topic-context">
    {topics.length > 1 && <label className="graph-topic-select">Chủ đề trong đồ thị<select value={topic?.id ?? ''} onChange={e=>setChosen(e.target.value)}>{topics.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
    <LocalTopicGraph topic={topic} onSelect={next=>{ if (hasUnsavedChanges && !window.confirm('Bạn có thay đổi chưa lưu. Bỏ thay đổi để mở chủ đề khác?')) return; router.push(`/?topicId=${encodeURIComponent(next.id)}`); }} />
  </div>;
}
