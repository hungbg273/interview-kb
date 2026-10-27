'use client';

import { useRefreshNotes } from './NotesProvider';
import { WorkspaceLink, useUnsavedChanges } from './WorkspaceNavigation';

import { WorkspaceIcon } from './WorkspaceIcon';
import { LocalTopicGraph } from './LocalTopicGraph';
import { TopicNoteContent } from './TopicNoteContent';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const UNCATEGORIZED = '__uncategorized__';
type Topic = { id: string; name: string };
type Note = { id: string; title: string; bodyMarkdown?: string };
type SearchHit = { topics: Topic[]; notes: Note[] };

export function SubjectExplorer() {
  const router = useRouter();
  const refreshSharedNotes = useRefreshNotes();
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia?.('(max-width: 760px)').matches) {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, []);
  const [roots, setRoots] = useState<Topic[]>([]);
  const [children, setChildren] = useState<Record<string, Topic[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState(UNCATEGORIZED);
  const [selectedName, setSelectedName] = useState('Chưa gán chủ đề');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [dirtyNotes, setDirtyNotes] = useState<Set<string>>(new Set());
  useUnsavedChanges(dirtyNotes.size > 0);
  const markDirty = useCallback((id: string, dirty: boolean) => setDirtyNotes(prev => { const next = new Set(prev); if (dirty) next.add(id); else next.delete(id); return next; }), []);
  function canLeaveTopic() { return dirtyNotes.size === 0 || window.confirm('Bạn có thay đổi chưa lưu. Bỏ thay đổi để mở chủ đề khác?'); }
  const [notes, setNotes] = useState<Note[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
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
    let cancelled = false;
    setLoadingNotes(true); setNotes([]); setLoadError('');
    const path = selected === UNCATEGORIZED ? '/notes?uncategorized=1' : `/notes?topicId=${selected}`;
    void api<{items: Note[]}>(path).then(data => { if (!cancelled) setNotes(data.items); })
      .catch(() => { if (!cancelled) setLoadError('Không tải được ghi chú.'); })
      .finally(() => { if (!cancelled) setLoadingNotes(false); });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    const topicId = new URLSearchParams(window.location.search).get('topicId');
    if (!topicId) return;
    let cancelled = false;
    void api<Topic>(`/topics/${encodeURIComponent(topicId)}`).then(topic => {
      if (!cancelled) void toggle(topic);
    }).catch(() => { if (!cancelled) setLoadError('Không tìm thấy chủ đề.'); });
    return () => { cancelled = true; };
  }, []);

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
    if (topic.id !== selected && !canLeaveTopic()) return;
    if (topic.id !== selected) setDirtyNotes(new Set());
    setSelected(topic.id);
    setSelectedName(topic.name);
    setQ(''); setHits(null);
    const willExpand = !expanded[topic.id];
    setExpanded((prev) => ({ ...prev, [topic.id]: willExpand }));
    if (willExpand && !children[topic.id]) {
      try {
        const next = await api<Topic[]>(`/topics?parentId=${topic.id}`);
        setChildren((prev) => ({ ...prev, [topic.id]: next }));
      } catch { setLoadError('Không tải được chủ đề con.'); }
    }
  }

  const filtering = q.trim().length > 0;
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
    if (selectedRef.current === selected) setNotes(data.items);
  }

  async function removeNote(id: string, title: string) {
    if (!window.confirm(`Xóa ghi chú “${title}”?`)) return;
    await api(`/notes/${id}`, { method: 'DELETE' });
    await reloadNotes();
    await refreshSharedNotes();
  }

  async function removeSelected() {
    if (selected === UNCATEGORIZED) return;
    await api(`/topics/${selected}`, { method: 'DELETE' });
    setSelected(UNCATEGORIZED);
    setSelectedName('Chưa gán chủ đề');
    setExpanded({});
    setChildren({});
    await loadRoots();
  }

  function topicBranch(topics: Topic[], ancestors: string[] = []): React.ReactNode {
    return topics.filter((topic) => !ancestors.includes(topic.id)).map((topic) => (
      <li key={topic.id}>
        <button type="button" className={`tree-item${selected === topic.id ? ' selected' : ''}`} aria-label={`Mở chủ đề ${topic.name}`} aria-expanded={!!expanded[topic.id]} onClick={() => void toggle(topic)}>
          <span className={expanded[topic.id] ? 'tree-chevron expanded' : 'tree-chevron'}><WorkspaceIcon name="chevron" /></span>
          <WorkspaceIcon name="folder" /><span>{topic.name}</span>
        </button>
        {expanded[topic.id] && children[topic.id]?.length > 0 && <ul>{topicBranch(children[topic.id], [...ancestors, topic.id])}</ul>}
      </li>
    ));
  }

  return (
    <main className={`explorer workspace-explorer${leftOpen ? '' : ' left-closed'}${rightOpen ? '' : ' right-closed'}`}>
      <div className="workspace-tabbar">
        <button type="button" className="icon-button" aria-label={leftOpen ? 'Ẩn cây chủ đề' : 'Hiện cây chủ đề'} aria-expanded={leftOpen} aria-controls="topic-tree" onClick={() => setLeftOpen(!leftOpen)}><WorkspaceIcon name="panel" /></button>
        <div className="workspace-tab"><WorkspaceIcon name="note" /> {selectedName}</div>
        <WorkspaceLink className="tab-new" href="/notes/new" aria-label="Tạo ghi chú mới" title="Tạo ghi chú mới"><WorkspaceIcon name="plus" /></WorkspaceLink>
        <button type="button" className="icon-button right-toggle" aria-label={rightOpen ? 'Ẩn thông tin chủ đề' : 'Hiện thông tin chủ đề'} aria-expanded={rightOpen} aria-controls="topic-details" onClick={() => setRightOpen(!rightOpen)}><WorkspaceIcon name="panel" /></button>
      </div>
      <nav id="topic-tree" className="topic-tree" aria-label="Cây chủ đề" hidden={!leftOpen}>
        <div className="sidebar-heading"><WorkspaceIcon name="folder" /><span>Không gian kiến thức</span></div>
        <p className="sidebar-caption">CHỦ ĐỀ</p>
        <button type="button" className={`tree-item${selected === UNCATEGORIZED ? ' selected' : ''}`} aria-label="Mở ghi chú chưa gán chủ đề" onClick={() => { if (!canLeaveTopic()) return; setDirtyNotes(new Set()); setSelected(UNCATEGORIZED); setSelectedName('Chưa gán chủ đề'); setQ(''); }}><WorkspaceIcon name="note" /><span>Chưa gán chủ đề</span></button>
        <ul className="topic-tree-list">{topicBranch(filtering && hits ? hits.topics : roots)}</ul>
        <WorkspaceLink className="sidebar-new" href="/notes/new"><WorkspaceIcon name="plus" /> Ghi chú mới</WorkspaceLink>
        <div className="sidebar-foot"><span className="session-dot" /> Kho kiến thức cá nhân</div>
      </nav>
      <section className="topic-content" aria-label="Nội dung chủ đề">
        <div className="content-breadcrumb">Không gian kiến thức <span>/</span> {selectedName}</div>
        <div className="row">
          <input
            className="graph-search"
            aria-label="Tìm chủ đề hoặc tiêu đề ghi chú"
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
              <WorkspaceLink key={n.id} href={`/notes/${n.id}`}>
                {n.title}
              </WorkspaceLink>
            ))}
          </div>
        )}
        <div className="topic-content-heading"><span className="content-kicker">CHỦ ĐỀ ĐANG MỞ</span><h1>{selectedName}</h1><p>{notes.length} ghi chú trong chủ đề này</p></div>
        {loadingNotes && <p role="status">Đang tải ghi chú…</p>}
        {loadError && <p role="alert" className="error">{loadError}</p>}
        {!loadingNotes && !loadError && notes.length === 0 && <div className="empty"><p>Chưa có ghi chú tại đây</p><button type="button" onClick={()=>{if (!canLeaveTopic()) return; router.push(selected === UNCATEGORIZED ? '/notes/new' : `/notes/new?topicId=${selected}`);}}>Viết ghi chú đầu tiên</button></div>}
        {notes.map(note => <TopicNoteContent key={note.id} note={note} onDirtyChange={markDirty} onSaved={async()=>{await reloadNotes();await refreshSharedNotes();}} onDelete={()=>void removeNote(note.id,note.title)} />)}
      </section>
      <aside id="topic-details" className="graph-panel" hidden={!rightOpen}>
        <LocalTopicGraph topic={selected === UNCATEGORIZED ? null : {id:selected,name:selectedName}} children={children[selected] ?? []} onSelect={topic=>{if (topic.id !== selected) void toggle(topic);}} />
        <div className="sidebar-heading"><WorkspaceIcon name="folder" /><span>Thông tin chủ đề</span></div>
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
            onClick={() => {
              if (!canLeaveTopic()) return;
              router.push(
                selected === UNCATEGORIZED
                  ? '/notes/new'
                  : `/notes/new?topicId=${selected}`,
              );
            }}
          >
            Tạo ghi chú
          </button>
          {selected !== UNCATEGORIZED && (
            <button type="button" className="ghost" onClick={() => void removeSelected()}>
              Xóa chủ đề
            </button>
          )}
        </div>
      </aside>
      <footer className="workspace-status"><span><WorkspaceIcon name="graph" /> {selected === UNCATEGORIZED ? 0 : 1 + (children[selected]?.length ?? 0)} nút trong đồ thị</span><span>{notes.length} ghi chú · {selectedName}</span></footer>
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
