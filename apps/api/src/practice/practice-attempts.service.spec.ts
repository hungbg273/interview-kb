import { PracticeAttemptsService } from './practice-attempts.service';
import { PracticeGradingService } from './practice-grading.service';
const essay = {
  type: 'essay',
  prompt: 'Explain',
  referenceAnswer: 'Reference',
  rubric: [{ id: 'a', description: 'Accuracy', maxPoints: 10 }],
};
function fixture() {
  const a = {
    id: 'a',
    userId: 'u',
    owner: 'u@example.invalid',
    status: 'in_progress',
    provider: 'openai',
    lang: 'vi',
    binding: {},
    items: [
      {
        id: 'i',
        snapshot: essay,
        answer: { type: 'essay', text: 'Answer' },
        revision: 1,
        state: 'answered',
        result: null,
        jobId: null,
      },
    ],
  };
  const repo = {
    change: jest.fn(async (_id, fn) => fn(a, {})),
    enqueue: jest.fn(async (_m, _a, i) => {
      i.state = 'grading';
      i.jobId = 'job';
      return true;
    }),
    pending: jest.fn().mockResolvedValue([{ id: 'a', userId: 'u' }]),
  };
  const svc = new PracticeAttemptsService(
    repo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new PracticeGradingService(),
    {} as never,
  );
  return { a, repo, svc };
}
describe('persisted practice orchestration', () => {
  it('reuses individually graded items on submission', async () => {
    const { a, svc, repo } = fixture();
    a.items[0].state = 'graded';
    a.items[0].result = { score: 8 } as never;
    const view = await svc.submit('a');
    expect(repo.enqueue).not.toHaveBeenCalled();
    expect(view.status).toBe('completed');
    expect(view.score).toBe(8);
  });
  it('freezes submitted answers even on grading failure', async () => {
    const { a, svc } = fixture();
    a.status = 'grading_failed';
    a.items[0].state = 'grading_failed';
    await expect(
      svc.save('a', 'i', {
        expectedRevision: 1,
        answer: { type: 'essay', text: 'Edit' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('retries only failed items', async () => {
    const { a, svc, repo } = fixture();
    a.status = 'grading_failed';
    a.items[0].state = 'grading_failed';
    await svc.submit('a', true);
    expect(repo.enqueue).toHaveBeenCalledTimes(1);
    expect(a.items[0].answer.text).toBe('Answer');
  });
  it('does not grade an empty attempt submission', async () => {
    const { a, svc, repo } = fixture();
    a.items[0].answer = null as never;
    await expect(svc.submit('a')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(repo.enqueue).not.toHaveBeenCalled();
  });
  it('sweeps pending attempts independently of browser activity', async () => {
    const { svc, repo, a } = fixture();
    a.status = 'submitting';
    await (
      svc as unknown as { resumePending: () => Promise<void> }
    ).resumePending();
    expect(repo.change).toHaveBeenCalledWith('a', expect.any(Function), 'u');
    expect(repo.enqueue).toHaveBeenCalledTimes(1);
  });
});
