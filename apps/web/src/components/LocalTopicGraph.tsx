'use client';

import { api } from '@/lib/api';
import { graphLayout } from '@/lib/graph-layout';
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
  const layout = useMemo(() => topic ? graphLayout([topic], {[topic.id]: children}, {[topic.id]: true}) : graphLayout([], {}, {}), [topic, children]);
  return (
    <section className="local-topic-graph" aria-label="Đồ thị cục bộ">
      <div className="sidebar-heading"><WorkspaceIcon name="graph" /><span>Đồ thị cục bộ</span><span className="graph-depth">Độ sâu 1</span><button type="button" className="graph-parent-back" aria-label="Về chủ đề cha" title={parentIds.length ? 'Về chủ đề cha' : 'Không có chủ đề cha'} disabled={parentIds.length === 0 || loadingParent === topic?.id} onClick={()=>void goToParent()}><WorkspaceIcon name="back" /></button></div>
      {parentError && <div role="alert" className="error">{parentError} <button type="button" className="ghost" onClick={()=>setAttempt(value=>value+1)}>Thử lại</button></div>}
      {parentOptions?.id === topic?.id && parentOptions && <div className="graph-parent-options" role="group" aria-label="Chọn chủ đề cha"><span>Chọn chủ đề cha</span>{parentOptions.topics.map(parent=><button type="button" className="ghost" key={parent.id} onClick={()=>{setParentOptions(null);onSelect({id:parent.id,name:parent.name});}}>{parent.name}</button>)}<button type="button" className="ghost" onClick={()=>setParentOptions(null)}>Đóng</button></div>}
      {!topic ? <p className="local-graph-empty">Chọn một chủ đề để xem các chủ đề con.</p> : <>
        {error && <div role="alert" className="error">{error} <button type="button" className="ghost" onClick={() => setAttempt(attempt + 1)}>Thử lại</button></div>}
        <div className="graph-canvas network-canvas local-network">
          <svg className="graph-edges" width="100%" height="100%" aria-hidden="true">
            {layout.edges.map(edge => {
              const a=layout.placed.get(edge.from)!, b=layout.placed.get(edge.to)!;
              return <line key={`${edge.from}-${edge.to}`} x1={`${a.x}%`} y1={`${a.y}%`} x2={`${b.x}%`} y2={`${b.y}%`} />;
            })}
          </svg>
          {[...layout.placed.values()].map(node => <div key={node.id} className="graph-node-wrap" style={{left:`${node.x}%`,top:`${node.y}%`}}>
            <button type="button" aria-pressed={node.id === topic.id} className={`graph-node${node.id === topic.id ? ' active' : ''}`} style={{'--node-size':node.id === topic.id ? '18px' : '9px'} as React.CSSProperties} onClick={() => onSelect(node)}>
              <span className="network-label">{node.name}</span>
            </button>
          </div>)}
        </div>
        <p className="local-graph-caption">{children.length} chủ đề con · Bấm vào nút để mở chủ đề</p>
      </>}
    </section>
  );
}
