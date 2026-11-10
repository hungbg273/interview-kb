import * as shared from '@kb/shared';
const valid = (value: unknown) =>
  (
    shared as unknown as { isValidQuestion: (v: unknown) => boolean }
  ).isValidQuestion?.(value);
const essay = {
  type: 'essay',
  prompt: 'Explain transactions',
  referenceAnswer: 'Atomic changes',
  rubric: [{ id: 'a', description: 'Accuracy', maxPoints: 10 }],
};
describe('essay question validation', () => {
  it('accepts a complete essay', () => expect(valid(essay)).toBe(true));
  it('rejects wrong rubric totals', () =>
    expect(
      valid({
        ...essay,
        rubric: [{ id: 'a', description: 'Accuracy', maxPoints: 9 }],
      }),
    ).toBe(false));
  it('rejects duplicate criteria', () =>
    expect(
      valid({
        ...essay,
        rubric: [
          { id: 'a', description: 'A', maxPoints: 5 },
          { id: 'a', description: 'B', maxPoints: 5 },
        ],
      }),
    ).toBe(false));
  it('rejects answer keys on an essay', () =>
    expect(valid({ ...essay, correctChoice: 'A' })).toBe(false));
});
