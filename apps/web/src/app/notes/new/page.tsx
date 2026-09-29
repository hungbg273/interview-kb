'use client';

import { api, ApiError } from '@/lib/api';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { NoteEditor } from '@/components/NoteEditor';

type NoteLink = { id: string; title: string };

export function NewNote() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notes, setNotes] = useState<NoteLink[]>([]);

  useEffect(() => {
    void api<{ items: NoteLink[] }>('/notes').then((data) => setNotes(data.items));
  }, []);

  async function save() {
    setError('');
    try {
      const note = await api<{ id: string }>('/notes', {
        method: 'POST',
        body: JSON.stringify({
          title,
          bodyMarkdown: body,
        }),
      });
      router.replace(`/notes/${note.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
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
          error={error}
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
      <NewNote />
    </AuthGate>
  );
}
