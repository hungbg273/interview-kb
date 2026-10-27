type Topic = { id: string; name: string; virtual?: boolean };
export type GraphPoint = Topic & { x: number; y: number; degree: number };

/** Deterministic spring layout; coordinates are percentages of the viewport. */
export function graphLayout(roots: Topic[], children: Record<string, Topic[]>, expanded: Record<string, boolean>) {
  const nodes = new Map<string, Topic>();
  const edges: Array<{from: string; to: string}> = [];
  const visited = new Set<string>();
  function visit(topic: Topic) {
    nodes.set(topic.id, topic);
    if (visited.has(topic.id)) return;
    visited.add(topic.id);
    if (!expanded[topic.id]) return;
    for (const child of children[topic.id] ?? []) {
      edges.push({from: topic.id, to: child.id});
      visit(child);
    }
  }
  roots.forEach(visit);
  const points: GraphPoint[] = [...nodes.values()].map((node, i) => {
    const angle = i * 2.3999632297;
    const radius = 19 + 14 * Math.sqrt((i + 1) / nodes.size);
    return {...node, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius, degree: 0};
  });
  const placed = new Map(points.map(p => [p.id, p]));
  for (const edge of edges) {
    placed.get(edge.from)!.degree++;
    placed.get(edge.to)!.degree++;
  }
  for (let step = 0; step < 220; step++) {
    const force = new Map(points.map(p => [p.id, {x: (50-p.x)*0.012,y: (50-p.y)*0.012}]));
    for (let i=0;i<points.length;i++) for (let j=i+1;j<points.length;j++) {
      const a=points[i], b=points[j];
      const dx=a.x-b.x, dy=a.y-b.y, d=Math.max(1,Math.hypot(dx,dy));
      const strength=95/(d*d);
      force.get(a.id)!.x += dx/d*strength; force.get(a.id)!.y += dy/d*strength;
      force.get(b.id)!.x -= dx/d*strength; force.get(b.id)!.y -= dy/d*strength;
    }
    for (const edge of edges) {
      const a=placed.get(edge.from)!,b=placed.get(edge.to)!;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
      const strength=(d-24)*0.045;
      force.get(a.id)!.x+=dx/d*strength;force.get(a.id)!.y+=dy/d*strength;
      force.get(b.id)!.x-=dx/d*strength;force.get(b.id)!.y-=dy/d*strength;
    }
    const cooling=1-step/250;
    for (const point of points) {
      const f=force.get(point.id)!;
      point.x=Math.max(12,Math.min(88,point.x+Math.max(-2,Math.min(2,f.x))*cooling));
      point.y=Math.max(12,Math.min(88,point.y+Math.max(-2,Math.min(2,f.y))*cooling));
    }
  }
  return {placed,edges};
}
