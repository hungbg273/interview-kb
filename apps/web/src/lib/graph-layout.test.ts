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
