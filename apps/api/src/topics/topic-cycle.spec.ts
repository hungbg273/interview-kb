import { wouldCreateCycle } from './topic-cycle';

describe('wouldCreateCycle', () => {
  const edges = [{ parentId: 'A', childId: 'B' }];

  it('refuses self-parent', () => {
    expect(wouldCreateCycle('A', 'A', [])).toBe(true);
  });

  it('refuses reversing an existing edge (A→B then B→A)', () => {
    expect(wouldCreateCycle('A', 'B', edges)).toBe(true);
  });

  it('allows a second parent that does not close a loop', () => {
    expect(wouldCreateCycle('B', 'C', edges)).toBe(false);
  });
});
