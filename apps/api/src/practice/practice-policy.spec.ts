import {
  applyAnswer,
  gradeMcq,
  publicAttempt,
  validateGrade,
} from './practice-policy';
const essay = {
  type: 'essay',
  prompt: 'Explain',
  referenceAnswer: 'Reference',
  rubric: [{ id: 'a', description: 'Accuracy', maxPoints: 10 }],
};
const item = () => ({
  id: 'i',
  snapshot: essay,
  answer: { type: 'essay', text: 'Answer' },
  revision: 1,
  state: 'answered',
  result: null,
  jobId: null,
});
describe('practice grading rules', () => {
  it('locks graded answers even when called outside the UI', () => {
    expect(() =>
      applyAnswer(
        { ...item(), state: 'graded' } as never,
        { type: 'essay', text: 'Edit' },
        1,
      ),
    ).toThrow();
  });
  it('rejects stale answer updates', () =>
    expect(() =>
      applyAnswer(item() as never, { type: 'essay', text: 'Edit' }, 0),
    ).toThrow());
  it('hides answer keys and reference material before grading', () => {
    const view = publicAttempt({
      id: 'a',
      status: 'in_progress',
      provider: 'openai',
      items: [item()],
    } as never);
    expect(JSON.stringify(view)).not.toContain('Reference');
    expect(JSON.stringify(view)).not.toContain('Accuracy');
  });
  it('validates criterion bounds and calculates the total itself', () => {
    const raw = {
      criteria: [{ criterionId: 'a', points: 7, explanation: 'Some gaps' }],
      strengths: [],
      gaps: ['Missing'],
      improvements: [],
      score: 100,
    };
    expect(validateGrade(essay as never, raw).score).toBe(7);
    expect(() =>
      validateGrade(essay as never, {
        ...raw,
        criteria: [{ criterionId: 'a', points: 11, explanation: 'x' }],
      }),
    ).toThrow();
    expect(() =>
      validateGrade(essay as never, { ...raw, criteria: [] }),
    ).toThrow();
  });
  it('scores MCQ without AI', () =>
    expect(
      gradeMcq({ type: 'mcq', correctChoice: 'A' } as never, {
        type: 'mcq',
        choice: 'B',
      }).score,
    ).toBe(0));
});
