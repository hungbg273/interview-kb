'use client';

import { api } from '@/lib/api';
import { localTopicLayout } from '@/lib/graph-layout';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';

export type GraphTopic = { id: string; name: string };

export function LocalTopicGraph({ topic, children: suppliedChildren, onSelect }: {
  topic: GraphTopic | null;
  children?: GraphTopic[];
  onSelect: (topic: GraphTopic) => void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; children: GraphTopic[] } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [parents, setParents] = useState<{id:string;ids:string[]} | null>(null);
  const [parentOptions, setParentOptions] = useState<{id:string;topics:GraphTopic[]} | null>(null);
  const [parentError, setParentError] = useState('');
  const [loadingParent, setLoadingParent] = useState<string | null>(null);
  const activeTopic = useRef(topic?.id);
  const viewport = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  useEffect(() => { if (viewport.current) viewport.current.scrollTop = 0; setHighlighted(null); }, [topic?.id]);
  activeTopic.current = topic?.id;
  useEffect(() => {
    setParentError(''); setParentOptions(null);
    if (!topic) return;
    let cancelled = false;
    void api<{parentIds:string[]}>(`/topics/${encodeURIComponent(topic.id)}`).then(detail => {
      if (!cancelled) setParents({id:topic.id,ids:detail.parentIds ?? []});
    }).catch(() => {if (!cancelled) setParentError('Không tải được chủ đề cha.');});
    return () => {cancelled=true;};
  },[topic?.id,attempt]);
  const parentIds = parents?.id === topic?.id ? parents?.ids ?? [] : [];
  async function goToParent() {
    if (!topic || parentIds.length === 0) return;
    const topicId=topic.id;
    setLoadingParent(topicId);setParentError('');
    try {
      const options=await Promise.all(parentIds.map(id=>api<GraphTopic>(`/topics/${encodeURIComponent(id)}`)));
      if (activeTopic.current !== topicId) return;
      if(options.length === 1) onSelect({id:options[0].id,name:options[0].name});
      else setParentOptions({id:topicId,topics:options});
    } catch {if(activeTopic.current === topicId) setParentError('Không mở được chủ đề cha.');}
    finally {setLoadingParent(current=>current === topicId ? null : current);}
  }
  useEffect(() => {
    setError('');
    if (!topic || suppliedChildren !== undefined) return;
    let cancelled = false;
    void api<GraphTopic[]>(`/topics?parentId=${encodeURIComponent(topic.id)}`).then((children) => {
      if (!cancelled) setLoaded({id: topic.id, children});
    }).catch(() => { if (!cancelled) setError('Không tải được đồ thị.'); });
    return () => { cancelled = true; };
  }, [topic?.id, suppliedChildren, attempt]);
  const children = suppliedChildren ?? (loaded?.id === topic?.id ? loaded?.children : []) ?? [];
  const layout = useMemo(() => topic ? localTopicLayout(topic, children) : null, [topic, children]);
  return (
    <section className="local-topic-graph" aria-label="Đồ thị cục bộ">
      <div className="sidebar-heading"><WorkspaceIcon name="graph" /><span>Đồ thị cục bộ</span><span className="graph-depth">Độ sâu 1</span><button type="button" className="graph-parent-back" aria-label="Về chủ đề cha" title={parentIds.length ? 'Về chủ đề cha' : 'Không có chủ đề cha'} disabled={parentIds.length === 0 || loadingParent === topic?.id} onClick={()=>void goToParent()}><WorkspaceIcon name="back" /></button></div>
      {parentError && <div role="alert" className="error">{parentError} <button type="button" className="ghost" onClick={()=>setAttempt(value=>value+1)}>Thử lại</button></div>}
      {parentOptions?.id === topic?.id && parentOptions && <div className="graph-parent-options" role="group" aria-label="Chọn chủ đề cha"><span>Chọn chủ đề cha</span>{parentOptions.topics.map(parent=><button type="button" className="ghost" key={parent.id} onClick={()=>{setParentOptions(null);onSelect({id:parent.id,name:parent.name});}}>{parent.name}</button>)}<button type="button" className="ghost" onClick={()=>setParentOptions(null)}>Đóng</button></div>}
      {!topic ? <p className="local-graph-empty">Chọn một chủ đề để xem các chủ đề con.</p> : <>
        {error && <div role="alert" className="error">{error} <button type="button" className="ghost" onClick={() => setAttempt(attempt + 1)}>Thử lại</button></div>}
        {layout && <div ref={viewport} className="topic-map-viewport" role="group" aria-label="Liên kết chủ đề">
          <div className="topic-map" style={{height:layout.height}}>
            <svg className="topic-map-edges" viewBox={`0 0 100 ${layout.height}`} preserveAspectRatio="none" aria-hidden="true">
              {layout.edges.map(({from,to}) => <path key={to.id}
                className={highlighted === to.id ? 'is-highlighted' : undefined}
                vectorEffect="non-scaling-stroke"
                d={`M ${from.x} ${from.y} C ${from.x} ${from.y + 64}, ${to.x} ${to.y - 56}, ${to.x} ${to.y}`} />)}
            </svg>
            {layout.nodes.map(node => <button key={node.id} type="button"
              className={`topic-map-node${node.id === topic.id ? ' is-current' : ''}`}
              style={{left:`${node.x}%`,top:node.y}}
              aria-label={node.name} aria-pressed={node.id === topic.id} title={node.name}
              onPointerEnter={() => setHighlighted(node.id)} onPointerLeave={() => setHighlighted(null)}
              onFocus={() => setHighlighted(node.id)} onBlur={() => setHighlighted(null)}
              onClick={() => onSelect({id:node.id,name:node.name})}>
              <span className="topic-map-dot" aria-hidden="true"><WorkspaceIcon name={node.id === topic.id ? 'folder' : 'note'} /></span>
              <span className="topic-map-label">{node.name}</span>
            </button>)}
          </div>
        </div>}
        <div className="topic-map-legend"><span><i aria-hidden="true" />Đang mở</span><span>{layout ? layout.nodes.length - 1 : 0} chủ đề con</span></div>

      </>}
    </section>
  );
}
