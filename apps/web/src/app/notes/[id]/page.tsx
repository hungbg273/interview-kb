"use client";

import { NoteWorkspace } from "@/components/NoteWorkspace";

import { AiPanel, type AiRunPayload } from "@/components/AiPanel";
import { NoteTopicGraph } from "@/components/NoteTopicGraph";
import {
  WorkspaceLink,
  useUnsavedChanges,
} from "@/components/WorkspaceNavigation";
import { useNoteList } from "@/components/NotesProvider";
import { NoteEditor } from "@/components/NoteEditor";
import { QuestionForm } from "@/components/QuestionForm";
import { api, ApiError } from "@/lib/api";
import {
  AiDifficulty,
  AiLang,
  AiProvider,
  CreateQuestionBody,
} from "@kb/shared";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Question = CreateQuestionBody & { id: string };
type TopicChip = { id: string; name: string };

const emptyForm: CreateQuestionBody = {
  prompt: "",
  choiceA: "",
  choiceB: "",
  choiceC: "",
  choiceD: "",
  correctChoice: "A",
  explanationMarkdown: "",
  lang: "vi",
};

function EditNote() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rightTab, setRightTab] = useState<"questions" | "ai">("questions");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [form, setForm] = useState<CreateQuestionBody>(emptyForm);
  const [provider, setProvider] = useState<AiProvider>("chatgpt");
  const [lastRun, setLastRun] = useState<AiRunPayload>({ action: "summarize" });
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState<AiDifficulty>("medium");
  const [questionLang, setQuestionLang] = useState<AiLang>("vi");
  const [preview, setPreview] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const aiPending = useRef(false);
  const { notes, refresh: refreshNotes, error: notesError } = useNoteList();
  const [topics, setTopics] = useState<TopicChip[]>([]);
  const [topicQuery, setTopicQuery] = useState("");
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
    let cancelled = false;
    void load()
      .catch(() => {
        if (!cancelled) {
          setError("Không tải được ghi chú.");
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
      await api(`/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          bodyMarkdown: body,
          topicIds: topics.map((t) => t.id),
        }),
      });
      await load();
      setDirty(false);
      await refreshNotes();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không lưu được");
      return false;
    }
  }

  async function refreshQuestions() {
    const note = await api<{ questions?: Question[] }>(`/notes/${id}`);
    setQuestions(note.questions ?? []);
  }

  async function addQuestion() {
    await api(`/notes/${id}/questions`, {
      method: "POST",
      body: JSON.stringify(form),
    });
    setForm(emptyForm);
    await refreshQuestions();
  }

  async function removeQuestion(qid: string) {
    await api(`/questions/${qid}`, { method: "DELETE" });
    await refreshQuestions();
  }

  async function runAi(payload: AiRunPayload) {
    if (aiPending.current) return;
    aiPending.current = true;
    setAiBusy(true);
    setLastRun(payload);
    setAiError("");
    try {
      const result = await api<{ markdown?: string }>(`/notes/${id}/ai`, {
        method: "POST",
        body: JSON.stringify({ ...payload, provider }),
      });
      if (payload.action === "generate-questions") {
        setPreview("");
        await refreshQuestions();
        return;
      }
      setPreview(result.markdown ?? "");
    } catch (e) {
      setAiError(e instanceof ApiError ? e.message : "AI lỗi");
    } finally {
      aiPending.current = false;
      setAiBusy(false);
    }
  }

  async function removeNote() {
    if (!window.confirm("Xóa ghi chú này?")) return;
    await api(`/notes/${id}`, { method: "DELETE" });
    await refreshNotes();
    router.replace("/");
  }

  async function applyPreview() {
    await api(`/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ bodyMarkdown: preview }),
    });
    setBody(preview);
    setPreview("");
  }

  return (
    <NoteWorkspace
      title={title}
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
                <WorkspaceLink
                  className={n.id === id ? "active" : ""}
                  href={`/notes/${n.id}`}
                >
                  {n.title || "Không tiêu đề"}
                </WorkspaceLink>
              </li>
            ))}
          </ul>
          <WorkspaceLink href="/notes/new">+ Tạo mới</WorkspaceLink>
        </>
      }
      right={
        <>
          <NoteTopicGraph key={id} topics={topics} hasUnsavedChanges={dirty} />
          <div
            className="sidebar-tool-tabs"
            role="tablist"
            aria-label="Công cụ ghi chú"
          >
            <button
              type="button"
              role="tab"
              id="questions-tab"
              aria-selected={rightTab === "questions"}
              aria-controls="questions-tools"
              onClick={() => setRightTab("questions")}
            >
              Câu hỏi
            </button>
            <button
              type="button"
              role="tab"
              id="ai-tab"
              aria-selected={rightTab === "ai"}
              aria-controls="ai-tools"
              onClick={() => setRightTab("ai")}
            >
              Trợ lý AI
            </button>
          </div>
          <section
            id="questions-tools"
            role="tabpanel"
            aria-labelledby="questions-tab"
            hidden={rightTab !== "questions"}
          >
            <h2>Câu hỏi</h2>
            {questions.length === 0 ? (
              <p className="sidebar-empty">
                Chưa có câu hỏi. Tạo câu đầu tiên bằng biểu mẫu bên dưới hoặc
                dùng Trợ lý AI.
              </p>
            ) : (
              <ul className="question-list">
                {questions.map((q) => (
                  <li key={q.id}>
                    {q.prompt} — đúng: {q.correctChoice} —{" "}
                    {q.lang === "en" ? "EN" : "VI"}{" "}
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => removeQuestion(q.id)}
                    >
                      Xoá
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <QuestionForm
              value={form}
              onChange={setForm}
              onSubmit={addQuestion}
            />
          </section>
          <section
            id="ai-tools"
            role="tabpanel"
            aria-labelledby="ai-tab"
            hidden={rightTab !== "ai"}
          >
            <AiPanel
              busy={aiBusy}
              hasUnsavedChanges={dirty}
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
              onDiscard={() => setPreview("")}
            />
          </section>
        </>
      }
    >
      {loading && <p role="status">Đang tải ghi chú…</p>}
      <NoteEditor
        disabled={loading || loadFailed}
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
      <button
        type="button"
        className="ghost danger-action note-delete"
        onClick={() => void removeNote()}
      >
        Xóa ghi chú
      </button>
    </NoteWorkspace>
  );
}

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <>
      <EditNote key={id} />
    </>
  );
}
