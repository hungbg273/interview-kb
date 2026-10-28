"use client";

import { NoteWorkspace } from "@/components/NoteWorkspace";

import { api, ApiError } from "@/lib/api";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NoteTopicGraph } from "@/components/NoteTopicGraph";
import {
  WorkspaceLink,
  useUnsavedChanges,
} from "@/components/WorkspaceNavigation";
import { useNoteList } from "@/components/NotesProvider";
import { NoteEditor } from "@/components/NoteEditor";

type TopicChip = { id: string; name: string };

function NewNote() {
  const router = useRouter();
  const params = useSearchParams();
  const createdId = useRef<string | null>(null);
  const presetTopicId = params.get("topicId");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { notes, refresh: refreshNotes, error: notesError } = useNoteList();
  const [topics, setTopics] = useState<TopicChip[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
  const [topicHits, setTopicHits] = useState<TopicChip[]>([]);

  useEffect(() => {
    if (!presetTopicId) return;
    void api<{ id: string; name: string }>(`/topics/${presetTopicId}`).then(
      (t) => {
        setTopics([{ id: t.id, name: t.name }]);
      },
    );
  }, [presetTopicId]);

  useEffect(() => {
    const q = topicQuery.trim();
    if (!q) {
      setTopicHits([]);
      return;
    }
    let cancelled = false;
    void api<{ topics: TopicChip[] }>(
      `/search?q=${encodeURIComponent(q)}`,
    ).then((data) => {
      if (cancelled) return;
      const chosen = new Set(topics.map((t) => t.id));
      setTopicHits(data.topics.filter((t) => !chosen.has(t.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [topicQuery, topics]);

  async function save() {
    setError("");
    try {
      const note = await api<{ id: string }>("/notes", {
        method: "POST",
        body: JSON.stringify({
          title,
          bodyMarkdown: body,
          topicIds: topics.map((t) => t.id),
        }),
      });
      createdId.current = note.id;
      setDirty(false);
      await refreshNotes();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không lưu được");
      return false;
    }
  }

  return (
    <NoteWorkspace
      title={title || "Ghi chú mới"}
      dirty={dirty}
      left={
        <>
          <h2>Ghi chú</h2>
          {notesError && (
            <p role="alert" className="error">
              {notesError}
            </p>
          )}
          <ul className="rail-list">
            {notes.map((n) => (
              <li key={n.id}>
                <WorkspaceLink href={`/notes/${n.id}`}>
                  {n.title || "Không tiêu đề"}
                </WorkspaceLink>
              </li>
            ))}
          </ul>
        </>
      }
      right={
        <>
          <NoteTopicGraph topics={topics} hasUnsavedChanges={dirty} />
          <h2>Câu hỏi</h2>
          <p className="empty">
            Lưu ghi chú trước, rồi thêm câu hỏi ABCD ở cột này.
          </p>
        </>
      }
    >
      <NoteEditor
        title={title}
        bodyMarkdown={body}
        onTitleChange={(value) => {
          setTitle(value);
          setDirty(true);
        }}
        onBodyChange={(value) => {
          setBody(value);
          setDirty(true);
        }}
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
          setDirty(true);
          setTopics((prev) => [...prev, t]);
          setTopicQuery("");
          setTopicHits([]);
        }}
        onRemoveTopic={(tid) => {
          setDirty(true);
          setTopics((prev) => prev.filter((t) => t.id !== tid));
        }}
      />
    </NoteWorkspace>
  );
}

export default function NewNotePage() {
  return (
    <>
      <Suspense fallback={<main className="empty">Đang tải…</main>}>
        <NewNote />
      </Suspense>
    </>
  );
}
