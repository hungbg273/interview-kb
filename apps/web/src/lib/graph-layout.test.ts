import { describe, expect, it } from 'vitest';
import { graphLayout } from './graph-layout';

describe('graphLayout', () => {
  it('places shared children once and retains each real relationship', () => {
    const shared = { id: 'shared', name: 'Shared' };
    const graph = graphLayout([{id:'a',name:'A'},{id:'b',name:'B'}], {a:[shared],b:[shared]}, {a:true,b:true});
    expect(graph.placed.size).toBe(3);
    expect(graph.edges).toEqual([{from:'a',to:'shared'},{from:'b',to:'shared'}]);
    for (const node of graph.placed.values()) {
      expect(Number.isFinite(node.x) && Number.isFinite(node.y)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(12);
      expect(node.x).toBeLessThanOrEqual(88);
      expect(node.y).toBeGreaterThanOrEqual(12);
      expect(node.y).toBeLessThanOrEqual(88);
    }
  });
  it('handles cycles defensively and does not invent connections between roots', () => {
    const a={id:'a',name:'A'}, b={id:'b',name:'B'};
    expect(graphLayout([a,b],{},{}).edges).toEqual([]);
    expect(graphLayout([a],{a:[b],b:[a]},{a:true,b:true}).placed.size).toBe(2);
    expect(graphLayout([],{},{}).placed.size).toBe(0);
  });
});

import { localTopicLayout } from './graph-layout';
describe('localTopicLayout', () => {
  const root = {id:'root',name:'Mạng máy tính'};
  it('centres a single topic and avoids inventing edges', () => {
    const layout=localTopicLayout(root,[]);
    expect(layout.nodes).toEqual([expect.objectContaining({id:'root',x:50})]);
    expect(layout.edges).toEqual([]);
  });
  it('keeps all children distinct, spaced and inside the scrollable canvas', () => {
    const children=Array.from({length:20},(_,i)=>({id:String(i),name:'Chủ đề '+i}));
    const layout=localTopicLayout(root,[root,...children,children[0]]);
    expect(layout.nodes).toHaveLength(21);
    expect(layout.edges).toHaveLength(20);
    for(const node of layout.nodes) {
      expect(node.y).toBeGreaterThanOrEqual(44);
      expect(node.y+64).toBeLessThanOrEqual(layout.height);
      expect(node.x).toBeGreaterThanOrEqual(25);
      expect(node.x).toBeLessThanOrEqual(75);
    }
    for(let i=1;i<layout.nodes.length;i++) for(let j=i+1;j<layout.nodes.length;j++) {
      const a=layout.nodes[i],b=layout.nodes[j];
      expect(Math.abs(a.x-b.x)>=50 || Math.abs(a.y-b.y)>=112).toBe(true);
    }
  });
});
