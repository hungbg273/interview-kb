export type TopicEdge = { parentId: string; childId: string };

/** True if adding parentId → childId would create a directed cycle. */
export function wouldCreateCycle(
  childId: string,
  parentId: string,
  edges: TopicEdge[],
): boolean {
  if (parentId === childId) return true;

  const children = new Map<string, string[]>();
  for (const edge of edges) {
    const list = children.get(edge.parentId) ?? [];
    list.push(edge.childId);
    children.set(edge.parentId, list);
  }

  const seen = new Set<string>();
  const stack = [childId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === parentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of children.get(current) ?? []) {
      stack.push(next);
    }
  }
  return false;
}
