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
  const [narrow, setNarrow] = useState(false);
  const leftPanel = useRef<HTMLElement>(null), rightPanel = useRef<HTMLElement>(null), stage = useRef<HTMLElement>(null);
  const leftToggle = useRef<HTMLButtonElement>(null), rightToggle = useRef<HTMLButtonElement>(null);
  const lastPanel = useRef<'left' | 'right'>('left');
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 760px)');
    if (!media) return;
    const update = ({matches}: {matches:boolean}) => {
      setNarrow(matches);
      if (matches) { setLeftOpen(false); setRightOpen(false); }
    };
    update(media); media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    const overlay = narrow && (leftOpen || rightOpen);
    stage.current?.toggleAttribute('inert', overlay);
    if (overlay) (leftOpen ? leftPanel : rightPanel).current?.focus();
  }, [narrow, leftOpen, rightOpen]);
  function togglePanel(side: 'left' | 'right') {
    lastPanel.current = side;
    if (side === 'left') { setLeftOpen(v => !v); if (narrow) setRightOpen(false); }
    else { setRightOpen(v => !v); if (narrow) setLeftOpen(false); }
  }
  function closePanels() {
    setLeftOpen(false); setRightOpen(false);
    (lastPanel.current === 'left' ? leftToggle : rightToggle).current?.focus();
  }
  const [roots, setRoots] = useState<Topic[]>([]);
  const [children, setChildren] = useState<Record<string, Topic[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState(UNCATEGORIZED);
  const [selectedName, setSelectedName] = useState('Chưa gán chủ đề');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [rootError, setRootError] = useState('');
  const [dirtyNotes, setDirtyNotes] = useState<Set<string>>(new Set());
  useUnsavedChanges(dirtyNotes.size > 0);
  const markDirty = useCallback((id: string, dirty: boolean) => setDirtyNotes(prev => { const next = new Set(prev); if (dirty) next.add(id); else next.delete(id); return next; }), []);
  function canLeaveTopic() { return dirtyNotes.size === 0 || window.confirm('Bạn có thay đổi chưa lưu. Bỏ thay đổi để mở chủ đề khác?'); }
  const [notes, setNotes] = useState<Note[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const [q, setQ] = useState('');
  const [searchError, setSearchError] = useState('');
  const [searchRetry, setSearchRetry] = useState(0);
  const [hits, setHits] = useState<SearchHit | null>(null);
  const [picker, setPicker] = useState<'note' | 'parent' | null>(null);
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState('');
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerItems, setPickerItems] = useState<Array<{ id: string; label: string }>>([]);

  const loadRoots = useCallback(async () => {
    setRootError('');
    try { setRoots(await api<Topic[]>('/topics')); }
    catch { setRootError('Không tải được danh sách chủ đề.'); }
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
  }, [selected, reload]);

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
    setSearchError('');
    setHits(null);
    if (!query) {
      setHits(null);
      return;
    }
    let cancelled = false;
    void api<SearchHit>(`/search?q=${encodeURIComponent(query)}`).then((data) => {
      if (!cancelled) setHits(data);
    }).catch(() => { if (!cancelled) setSearchError('Không tìm kiếm được. Hãy thử lại.'); });
    return () => {
      cancelled = true;
    };
  }, [q, searchRetry]);

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
  const [topicForm, setTopicForm] = useState<{kind:'root'|'child'|'parent'; target?:string} | null>(null);
  const [topicName, setTopicName] = useState('');
  const [topicError, setTopicError] = useState('');
  const [topicBusy, setTopicBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (topicForm) nameInput.current?.focus(); }, [topicForm]);
  function openTopicForm(kind:'root'|'child'|'parent', target?:string) {
    if (narrow) { setLeftOpen(false); setRightOpen(false); }
    setTopicName(''); setTopicError(''); setTopicForm({kind,target});
  }
  async function submitTopic() {
    if (!topicForm || topicBusy || !topicName.trim()) return;
    setTopicBusy(true); setTopicError('');
    try {
      if (topicForm.kind === 'parent') {
        const data = await api<SearchHit>(`/search?q=${encodeURIComponent(topicName.trim())}`);
        const options = data.topics.filter(t => t.id !== topicForm.target);
        if (!options.length) { setTopicError('Không tìm thấy chủ đề phù hợp.'); return; }
        setPickerItems(options.map(t => ({id:t.id,label:t.name})));
        setPickerTarget(topicForm.target ?? null); setPickerError('');
        setPicker('parent');
      } else {
        await api('/topics', {method:'POST',body:JSON.stringify({name:topicName.trim(), ...(topicForm.target ? {parentIds:[topicForm.target]} : {})})});
        const target = topicForm.target;
        setTopicForm(null);
        if (target) {
          try {
            const next = await api<Topic[]>(`/topics?parentId=${target}`);
            setChildren(prev => ({...prev,[target]:next}));
            setExpanded(prev => ({...prev,[target]:true}));
          } catch { setLoadError('Chủ đề đã tạo, nhưng chưa tải lại được danh sách.'); }
        }
        await loadRoots();
      }
      setTopicForm(null);
    } catch { setTopicError('Không hoàn tất được yêu cầu. Nội dung nhập vẫn được giữ, hãy thử lại.'); }
    finally { setTopicBusy(false); }
  }

  async function openAttach(topicId: string) {
    if (narrow) { setLeftOpen(false); setRightOpen(false); }
    setPickerTarget(topicId); setPicker('note'); setPickerError(''); setPickerItems([]); setPickerBusy(true);
    try {
      const data = await api<{ items: Note[] }>('/notes');
      setPickerItems(data.items.map(n => ({id:n.id,label:n.title})));
    } catch { setPickerError('Không tải được ghi chú. Hãy đóng bảng và thử lại.'); }
    finally { setPickerBusy(false); }
  }

  async function pick(id: string) {
    if (!pickerTarget || pickerBusy) return;
    const target = pickerTarget;
    setPickerBusy(true); setPickerError('');
    try {
      if (picker === 'note') {
        const note = await api<{topicIds:string[]}>(`/notes/${id}`);
        const topicIds = Array.from(new Set([...(note.topicIds ?? []), target]));
        await api(`/notes/${id}/topics`, {method:'PUT',body:JSON.stringify({topicIds})});
        const data = await api<{items:Note[]}>(`/notes?topicId=${target}`);
        if (selectedRef.current === target) setNotes(data.items);
        setPicker(null);
      } else {
        await api(`/topics/${target}/parents`, {method:'POST',body:JSON.stringify({parentId:id})});
        setPicker(null);
        await loadRoots();
      }
    } catch { setPickerError('Không hoàn tất được yêu cầu. Hãy thử lại.'); }
    finally { setPickerBusy(false); }
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
    <main className={`explorer workspace-explorer${leftOpen ? '' : ' left-closed'}${rightOpen ? '' : ' right-closed'}`} onKeyDown={event => { if (event.key === 'Escape') { closePanels(); } }}>
      <div className="workspace-tabbar">
        <button type="button" className="icon-button" aria-label={leftOpen ? 'Ẩn cây chủ đề' : 'Hiện cây chủ đề'} aria-expanded={leftOpen} aria-controls="topic-tree" ref={leftToggle} onClick={() => togglePanel('left')}><WorkspaceIcon name="panel" /></button>
        <div className="workspace-tab"><WorkspaceIcon name="note" /> <span title={selectedName}>{selectedName}</span></div>
        <WorkspaceLink className="tab-new" href="/notes/new" aria-label="Tạo ghi chú mới" title="Tạo ghi chú mới"><WorkspaceIcon name="plus" /></WorkspaceLink>
        <button type="button" className="icon-button right-toggle" aria-label={rightOpen ? 'Ẩn thông tin chủ đề' : 'Hiện thông tin chủ đề'} aria-expanded={rightOpen} aria-controls="topic-details" ref={rightToggle} onClick={() => togglePanel('right')}><WorkspaceIcon name="panel" /></button>
      </div>
      {narrow && (leftOpen || rightOpen) && <button className="workspace-scrim" type="button" tabIndex={-1} aria-label="Đóng bảng bên" onClick={closePanels} />}
      <nav ref={leftPanel} tabIndex={-1} id="topic-tree" className="topic-tree" aria-label="Cây chủ đề" hidden={!leftOpen}>
        <div className="sidebar-heading"><WorkspaceIcon name="folder" /><span>Không gian kiến thức</span></div>
        <p className="sidebar-caption">CHỦ ĐỀ</p>
        <button type="button" className={`tree-item${selected === UNCATEGORIZED ? ' selected' : ''}`} aria-label="Mở ghi chú chưa gán chủ đề" onClick={() => { if (!canLeaveTopic()) return; setDirtyNotes(new Set()); setSelected(UNCATEGORIZED); setSelectedName('Chưa gán chủ đề'); setQ(''); }}><WorkspaceIcon name="note" /><span>Chưa gán chủ đề</span></button>
        {rootError && <p role="alert" className="error">{rootError} <button type="button" className="ghost" onClick={() => void loadRoots()}>Thử lại</button></p>}
        <ul className="topic-tree-list">{topicBranch(filtering && hits ? hits.topics : roots)}</ul>
        <WorkspaceLink className="sidebar-new" href="/notes/new"><WorkspaceIcon name="plus" /> Ghi chú mới</WorkspaceLink>
        <div className="sidebar-foot"><span className="session-dot" /> Kho kiến thức cá nhân</div>
      </nav>
      <section ref={stage} className="topic-content" aria-label="Nội dung chủ đề">
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
            onClick={() => openTopicForm('root')}
          >
            Thêm chủ đề gốc
          </button>
        </div>
        {searchError && <p className="error" role="alert">{searchError} <button type="button" className="ghost" onClick={() => setSearchRetry(v => v + 1)}>Tìm lại</button></p>}
        {topicForm && <form className="topic-form" onSubmit={event => { event.preventDefault(); void submitTopic(); }}>
          <h2>{topicForm.kind === 'parent' ? 'Tìm chủ đề cha' : 'Tạo chủ đề'}</h2>
          <label htmlFor="topic-name">Tên chủ đề</label>
          <input ref={nameInput} id="topic-name" value={topicName} required disabled={topicBusy} onChange={event => setTopicName(event.target.value)} aria-describedby={topicError ? 'topic-form-error' : undefined} />
          {topicError && <p id="topic-form-error" role="alert" className="error">{topicError}</p>}
          <div className="row"><button disabled={topicBusy || !topicName.trim()} type="submit">{topicBusy ? 'Đang xử lý…' : topicForm.kind === 'parent' ? 'Tìm chủ đề' : 'Tạo chủ đề'}</button><button disabled={topicBusy} type="button" className="ghost" onClick={() => setTopicForm(null)}>Hủy</button></div>
        </form>}
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
        {loadError && <p role="alert" className="error">{loadError} <button type="button" className="ghost" onClick={() => setReload(v => v + 1)}>Thử lại</button></p>}
        {!loadingNotes && !loadError && notes.length === 0 && <div className="empty"><p>Chưa có ghi chú tại đây</p><button type="button" onClick={()=>{if (!canLeaveTopic()) return; router.push(selected === UNCATEGORIZED ? '/notes/new' : `/notes/new?topicId=${selected}`);}}>Viết ghi chú đầu tiên</button></div>}
        {notes.map(note => <TopicNoteContent key={note.id} note={note} onDirtyChange={markDirty} onSaved={async()=>{await reloadNotes();await refreshSharedNotes();}} onDelete={()=>void removeNote(note.id,note.title)} />)}
      </section>
      <aside ref={rightPanel} tabIndex={-1} id="topic-details" className="graph-panel" hidden={!rightOpen}>
        <LocalTopicGraph topic={selected === UNCATEGORIZED ? null : {id:selected,name:selectedName}} onSelect={topic=>{if (topic.id !== selected) void toggle(topic);}}>{children[selected] ?? []}</LocalTopicGraph>
        <div className="sidebar-heading"><WorkspaceIcon name="folder" /><span>Thông tin chủ đề</span></div>
        <h2>{selectedName}</h2>
        <p className="lede">
          {selected === UNCATEGORIZED
            ? 'Ghi chú chưa gắn chủ đề'
            : 'Ghi chú gắn trực tiếp với chủ đề này'}
        </p>
        {selected !== UNCATEGORIZED && (
          <div className="panel-actions">
            <button type="button" onClick={() => openTopicForm('child', selected)}>
              Thêm chủ đề con
            </button>
            <button type="button" onClick={() => void openAttach(selected)}>
              Gắn ghi chú
            </button>
            <button type="button" onClick={() => openTopicForm('parent', selected)}>
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
        <div className="picker" role="region" aria-label="Chọn liên kết chủ đề">
          {pickerError && <p className="error" role="alert">{pickerError}</p>}
          {pickerBusy && <p role="status">Đang tải…</p>}
          <h2>{picker === 'note' ? 'Chọn ghi chú' : 'Chọn chủ đề cha'}</h2>
          <button type="button" className="ghost" disabled={pickerBusy} onClick={() => setPicker(null)}>
            Đóng
          </button>
          <ul className="cards">
            {pickerItems.map((item) => (
              <li key={item.id}>
                <button type="button" className="ghost" disabled={pickerBusy} onClick={() => void pick(item.id)}>
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
