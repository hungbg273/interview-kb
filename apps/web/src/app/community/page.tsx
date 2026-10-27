"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { WorkspaceLink } from "@/components/WorkspaceNavigation";
import { useRefreshNotes } from "@/components/NotesProvider";
type Entry = {
  id: string;
  title: string;
  author: string;
  publishedAt: string;
  saved: boolean;
};
type Article = Entry & { bodyMarkdown: string };
type Topic = { id: string; name: string; parentIds?: string[] };
function date(value: string) {
  return new Date(value).toLocaleDateString("vi-VN");
}
export default function CommunityPage() {
  const [entries, setEntries] = useState<Entry[]>([]),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [article, setArticle] = useState<Article | null>(null),
    [reading, setReading] = useState(false),
    [detailError, setDetailError] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]),
    [topicId, setTopicId] = useState(""),
    [saving, setSaving] = useState(false),
    [cloneId, setCloneId] = useState<string | null>(null);
  const refreshNotes = useRefreshNotes();
  useEffect(() => {
    const abort = new AbortController();
    let alive = true;
    setLoading(true);
    setError("");
    setSelected(null);
    setArticle(null);
    void api<{ items: Entry[]; hasMore: boolean }>(
      `/community/notes?page=${page}`,
      { signal: abort.signal },
    )
      .then((data) => {
        if (alive) {
          setEntries(data.items);
          setMore(data.hasMore);
        }
      })
      .catch((e) => {
        if (alive)
          setError(
            e instanceof Error
              ? e.message
              : "Không tải được ghi chú công khai.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      abort.abort();
    };
  }, [page]);
  useEffect(() => {
    const abort = new AbortController();
    let alive = true;
    void api<Topic[]>("/topics/catalog", { signal: abort.signal })
      .then((result) => {
        if (alive) setTopics(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
      abort.abort();
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    const abort = new AbortController();
    let alive = true;
    setReading(true);
    setArticle(null);
    setDetailError("");
    setCloneId(null);
    setTopicId("");
    void api<Article>(`/community/notes/${selected}`, { signal: abort.signal })
      .then((data) => {
        if (alive) setArticle(data);
      })
      .catch((e) => {
        if (alive)
          setDetailError(
            e instanceof Error ? e.message : "Không mở được ghi chú.",
          );
      })
      .finally(() => {
        if (alive) setReading(false);
      });
    return () => {
      alive = false;
      abort.abort();
    };
  }, [selected]);
  async function clone() {
    if (!article || saving) return;
    setSaving(true);
    setDetailError("");
    try {
      const data = await api<{ id: string }>(
        `/community/notes/${article.id}/clone`,
        { method: "POST", body: JSON.stringify(topicId ? { topicId } : {}) },
      );
      setCloneId(data.id);
      setArticle({ ...article, saved: true });
      setEntries((items) =>
        items.map((item) =>
          item.id === article.id ? { ...item, saved: true } : item,
        ),
      );
      await refreshNotes();
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Không lưu được bản sao.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="community-page">
      <header className="community-heading">
        <div>
          <p className="eyebrow">Không gian kiến thức</p>
          <h1>Cộng đồng</h1>
          <p>
            Khám phá ghi chú được chia sẻ. Lưu một bản sao để học và chỉnh sửa
            theo cách của bạn.
          </p>
        </div>
        <span className="community-sort">Mới xuất bản</span>
      </header>
      {error && (
        <p role="alert" className="banner">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Đang tải ghi chú công khai…</p>
      ) : !error && !entries.length ? (
        <section className="community-empty">
          <h2>Chưa có ghi chú công khai từ người khác.</h2>
          <p>
            Ghi chú cá nhân luôn riêng tư cho đến khi bạn chủ động xuất bản.
          </p>
          <WorkspaceLink href="/">Về thư viện của bạn</WorkspaceLink>
          {page > 1 && (
            <button
              type="button"
              className="ghost"
              onClick={() => setPage(page - 1)}
            >
              Về trang trước
            </button>
          )}
        </section>
      ) : (
        <div className="community-layout">
          <aside className="community-feed" aria-label="Ghi chú mới xuất bản">
            {entries.map((entry) => (
              <button
                className={`community-entry${selected === entry.id ? " selected" : ""}`}
                type="button"
                key={entry.id}
                disabled={saving}
                aria-pressed={selected === entry.id}
                onClick={() => setSelected(entry.id)}
              >
                <strong>{entry.title}</strong>
                <span>
                  {entry.author} · {date(entry.publishedAt)}
                </span>
                {entry.saved && <small>Đã lưu vào thư viện</small>}
              </button>
            ))}
            <nav className="community-pagination" aria-label="Trang ghi chú">
              <button
                type="button"
                className="ghost"
                disabled={page === 1 || saving}
                onClick={() => setPage(page - 1)}
              >
                Trước
              </button>
              <span>Trang {page}</span>
              <button
                type="button"
                className="ghost"
                disabled={!more || saving}
                onClick={() => setPage(page + 1)}
              >
                Sau
              </button>
            </nav>
          </aside>
          <section
            className="community-article"
            aria-label="Nội dung công khai"
          >
            {!selected && (
              <p className="muted">Chọn một ghi chú để đọc nội dung.</p>
            )}
            {reading && <p role="status">Đang mở ghi chú…</p>}
            {detailError && (
              <p role="alert" className="banner">
                {detailError}
              </p>
            )}
            {article && (
              <>
                <header>
                  <h2>{article.title}</h2>
                  <p className="community-byline">
                    {article.author} · Xuất bản {date(article.publishedAt)}
                  </p>
                </header>
                <MarkdownPreview markdown={article.bodyMarkdown} />
                <footer className="community-save">
                  <p>
                    Bản sao thuộc thư viện của bạn và không tự thay đổi theo bản
                    gốc.
                  </p>
                  {cloneId ? (
                    <WorkspaceLink href={`/notes/${cloneId}`}>
                      Mở bản sao của bạn
                    </WorkspaceLink>
                  ) : (
                    <>
                      <label>
                        Lưu vào chủ đề
                        <select
                          disabled={saving || article.saved}
                          value={topicId}
                          onChange={(e) => setTopicId(e.target.value)}
                        >
                          <option value="">Chưa gán chủ đề</option>
                          {topics.map((topic) => (
                            <option key={topic.id} value={topic.id}>
                              {topic.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void clone()}
                      >
                        {saving
                          ? "Đang lưu…"
                          : article.saved
                            ? "Mở bản sao đã lưu"
                            : "Lưu vào thư viện"}
                      </button>
                    </>
                  )}
                </footer>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
