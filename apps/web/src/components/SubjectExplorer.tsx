'use client';

import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

const UNCATEGORIZED = '__uncategorized__';
const NODE = 112;
const GAP = 36;
const BRANCH = 210;
const PAD = 36;

type Topic = { id: string; name: string };
type Note = { id: string; title: string };
type SearchHit = { topics: Topic[]; notes: Note[] };
type Placed = { x: number; y: number; name: string; virtual?: boolean };

function mindMapLayout(
  roots: Topic[],
  children: Record<string, Topic[]>,
  expanded: Record<string, boolean>,
  includeUncategorized = true,
) {
  const placed = new Map<string, Placed>();
  const edges: Array<{ from: string; to: string }> = [];

  function kidsOf(id: string) {
    return expanded[id] ? (children[id] ?? []) : [];
  }

  function subtreeSpan(id: string): number {
    const kids = kidsOf(id);
    if (kids.length === 0) return NODE + GAP;
    return Math.max(
      NODE + GAP,
      kids.reduce((sum, kid) => sum + subtreeSpan(kid.id), 0),
    );
  }

  function layoutTopic(topic: Topic, x: number, cy: number, virtual?: boolean) {
    if (!placed.has(topic.id)) {
      placed.set(topic.id, { x, y: cy - NODE / 2, name: topic.name, virtual });
    }
    const kids = kidsOf(topic.id);
    if (kids.length === 0) return;
    const total = kids.reduce((sum, kid) => sum + subtreeSpan(kid.id), 0);
    let cursor = cy - total / 2;
    for (const kid of kids) {
      const span = subtreeSpan(kid.id);
      layoutTopic(kid, x + BRANCH, cursor + span / 2);
      edges.push({ from: topic.id, to: kid.id });
      cursor += span;
    }
  }

  let cursor = PAD;
  const trunks: Array<{ topic: Topic; virtual?: boolean }> = [
    ...(includeUncategorized
      ? [{ topic: { id: UNCATEGORIZED, name: 'Chưa gán chủ đề' }, virtual: true }]
      : []),
    ...roots.map((topic) => ({ topic })),
  ];
  for (const { topic, virtual } of trunks) {
    const span = subtreeSpan(topic.id);
    layoutTopic(topic, PAD, cursor + span / 2, virtual);
    cursor += span;
  }

  return { placed, edges };
}

export function SubjectExplorer() {
  const router = useRouter();
  const [roots, setRoots] = useState<Topic[]>([]);
  const [children, setChildren] = useState<Record<string, Topic[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState(UNCATEGORIZED);
  const [notes, setNotes] = useState<Note[]>([]);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit | null>(null);
  const [picker, setPicker] = useState<'note' | 'parent' | null>(null);
  const [pickerItems, setPickerItems] = useState<Array<{ id: string; label: string }>>([]);

  const loadRoots = useCallback(async () => {
    setRoots(await api<Topic[]>('/topics'));
  }, []);

  useEffect(() => {
    void loadRoots();
  }, [loadRoots]);

  useEffect(() => {
    const path =
      selected === UNCATEGORIZED
        ? '/notes?uncategorized=1'
        : `/notes?topicId=${selected}`;
    void api<{ items: Note[] }>(path).then((data) => setNotes(data.items));
  }, [selected]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits(null);
      return;
    }
    let cancelled = false;
    void api<SearchHit>(`/search?q=${encodeURIComponent(query)}`).then((data) => {
      if (!cancelled) setHits(data);
    });
    return () => {
      cancelled = true;
    };
  }, [q]);

  async function toggle(topic: Topic) {
    setSelected(topic.id);
    const willExpand = !expanded[topic.id];
    setExpanded((prev) => ({ ...prev, [topic.id]: willExpand }));
    if (willExpand && !children[topic.id]) {
      const next = await api<Topic[]>(`/topics?parentId=${topic.id}`);
      setChildren((prev) => ({ ...prev, [topic.id]: next }));
    }
  }

  const filtering = q.trim().length > 0;
  const layout = useMemo(() => {
    if (filtering && hits) {
      const needle = q.trim().toLowerCase();
      const showUncategorized = 'chưa gán chủ đề'.includes(needle);
      return mindMapLayout(hits.topics, {}, {}, showUncategorized);
    }
    return mindMapLayout(roots, children, expanded);
  }, [roots, children, expanded, filtering, hits, q]);

  async function addChild(parentId: string) {
    const name = window.prompt('Tên chủ đề con');
    if (!name?.trim()) return;
    await api('/topics', {
      method: 'POST',
      body: JSON.stringify({ name: name.trim(), parentIds: [parentId] }),
    });
    const next = await api<Topic[]>(`/topics?parentId=${parentId}`);
    setChildren((prev) => ({ ...prev, [parentId]: next }));
    setExpanded((prev) => ({ ...prev, [parentId]: true }));
    await loadRoots();
  }

  async function openAttach(topicId: string) {
    const data = await api<{ items: Note[] }>('/notes');
    setSelected(topicId);
    setPicker('note');
    setPickerItems(data.items.map((n) => ({ id: n.id, label: n.title })));
  }

  async function openParent(childId: string) {
    const qName = window.prompt('Tên chủ đề cha (tìm gần đúng)');
    if (!qName?.trim()) return;
    const data = await api<SearchHit>(`/search?q=${encodeURIComponent(qName.trim())}`);
    const options = data.topics.filter((t) => t.id !== childId);
    if (options.length === 0) {
      window.alert('Không tìm thấy chủ đề');
      return;
    }
    setSelected(childId);
    setPicker('parent');
    setPickerItems(options.map((t) => ({ id: t.id, label: t.name })));
  }

  async function pick(id: string) {
    if (picker === 'note' && selected !== UNCATEGORIZED) {
      const note = await api<{ topicIds: string[] }>(`/notes/${id}`);
      const topicIds = Array.from(new Set([...(note.topicIds ?? []), selected]));
      await api(`/notes/${id}/topics`, {
        method: 'PUT',
        body: JSON.stringify({ topicIds }),
      });
      const data = await api<{ items: Note[] }>(`/notes?topicId=${selected}`);
      setNotes(data.items);
    }
    if (picker === 'parent' && selected !== UNCATEGORIZED) {
      await api(`/topics/${selected}/parents`, {
        method: 'POST',
        body: JSON.stringify({ parentId: id }),
      });
      await loadRoots();
    }
    setPicker(null);
  }

  async function reloadNotes() {
    const path =
      selected === UNCATEGORIZED
        ? '/notes?uncategorized=1'
        : `/notes?topicId=${selected}`;
    const data = await api<{ items: Note[] }>(path);
    setNotes(data.items);
  }

  async function removeNote(id: string, title: string) {
    if (!window.confirm(`Xóa ghi chú “${title}”?`)) return;
    await api(`/notes/${id}`, { method: 'DELETE' });
    await reloadNotes();
  }

  async function removeSelected() {
    if (selected === UNCATEGORIZED) return;
    await api(`/topics/${selected}`, { method: 'DELETE' });
    setSelected(UNCATEGORIZED);
    setExpanded({});
    setChildren({});
    await loadRoots();
  }

  const selectedName =
    selected === UNCATEGORIZED
      ? 'Chưa gán chủ đề'
      : layout.placed.get(selected)?.name ?? 'Chủ đề';

  const canvasW =
    Math.max(480, ...[...layout.placed.values()].map((n) => n.x + NODE + 40));
  const canvasH =
    Math.max(320, ...[...layout.placed.values()].map((n) => n.y + NODE + 40));

  return (
    <main className="explorer">
      <section className="graph-pane">
        <div className="row">
          <input
            className="graph-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm chủ đề hoặc tiêu đề ghi chú"
          />
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const name = window.prompt('Tên chủ đề gốc');
              if (!name?.trim()) return;
              void api('/topics', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim() }),
              }).then(() => loadRoots());
            }}
          >
            Thêm chủ đề gốc
          </button>
        </div>
        {hits && hits.notes.length > 0 && (
          <div className="search-overlay">
            <h2>Ghi chú</h2>
            {hits.notes.map((n) => (
              <a key={n.id} href={`/notes/${n.id}`}>
                {n.title}
              </a>
            ))}
          </div>
        )}
        <div className="graph-canvas" style={{ width: canvasW, height: canvasH }}>
          <svg className="graph-edges" width={canvasW} height={canvasH}>
            {layout.edges.map((e) => {
              const a = layout.placed.get(e.from);
              const b = layout.placed.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + NODE;
              const y1 = a.y + NODE / 2;
              const x2 = b.x;
              const y2 = b.y + NODE / 2;
              const dx = Math.max(56, (x2 - x1) * 0.55);
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          {[...layout.placed.entries()].map(([id, node]) => (
            <div
              key={id}
              className="graph-node-wrap"
              style={{ left: node.x, top: node.y }}
            >
              <button
                type="button"
                className={`graph-node${selected === id ? ' active' : ''}${node.virtual ? ' virtual' : ''}`}
                onClick={() => {
                  setQ('');
                  setHits(null);
                  if (id === UNCATEGORIZED) {
                    setSelected(UNCATEGORIZED);
                    return;
                  }
                  void toggle({ id, name: node.name });
                }}
              >
                <span>{node.name}</span>
              </button>
            </div>
          ))}
        </div>
      </section>
      <aside className="graph-panel">
        <h2>{selectedName}</h2>
        <p className="lede">
          {selected === UNCATEGORIZED
            ? 'Note chưa gắn chủ đề'
            : 'Chỉ note gắn đúng node này'}
        </p>
        {selected !== UNCATEGORIZED && (
          <div className="panel-actions">
            <button type="button" onClick={() => void addChild(selected)}>
              Thêm chủ đề con
            </button>
            <button type="button" onClick={() => void openAttach(selected)}>
              Gắn ghi chú
            </button>
            <button type="button" onClick={() => void openParent(selected)}>
              Thêm cha
            </button>
          </div>
        )}
        <div className="row">
          <button
            type="button"
            onClick={() =>
              router.push(
                selected === UNCATEGORIZED
                  ? '/notes/new'
                  : `/notes/new?topicId=${selected}`,
              )
            }
          >
            Tạo ghi chú
          </button>
          {selected !== UNCATEGORIZED && (
            <button type="button" className="ghost" onClick={() => void removeSelected()}>
              Xóa chủ đề
            </button>
          )}
        </div>
        {notes.length === 0 ? (
          <p className="empty">Chưa có ghi chú tại đây</p>
        ) : (
          <ul className="cards">
            {notes.map((n) => (
              <li key={n.id} className="note-row">
                <a href={`/notes/${n.id}`}>{n.title}</a>
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Xóa ${n.title}`}
                  onClick={() => void removeNote(n.id, n.title)}
                >
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      {picker && (
        <div className="picker">
          <h2>{picker === 'note' ? 'Chọn ghi chú' : 'Chọn chủ đề cha'}</h2>
          <button type="button" className="ghost" onClick={() => setPicker(null)}>
            Đóng
          </button>
          <ul className="cards">
            {pickerItems.map((item) => (
              <li key={item.id}>
                <button type="button" className="ghost" onClick={() => void pick(item.id)}>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
