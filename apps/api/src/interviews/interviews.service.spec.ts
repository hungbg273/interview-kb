import { InterviewContextResolver } from './interview-context';
import type { InterviewSession } from '@kb/shared';
import { InterviewsService } from './interviews.service';
import { withAccount, currentAccount } from '../accounts/account-context';
import { setup } from './interview-fixtures';
import { AppError } from '../common/app-error';

const account = { id: 'owner', email: 'test@example.com', displayName: 'Test' };
const context = {
  subjects: [{ id: setup.topicIds[0], name: 'Node.js' }],
  notes: [],
  characters: 80,
};
class MemoryStore {
  sessions = new Map<
    string,
    { owner: string; session: InterviewSession; credentials: number }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  async create(session: InterviewSession) {
    this.sessions.set(session.id, {
      owner: currentAccount().id,
      session: structuredClone(session),
      credentials: 0,
    });
    return session;
  }
  async get(id: string) {
    const row = this.sessions.get(id);
    if (!row || row.owner !== currentAccount().id) throw AppError.notFound();
    return structuredClone(row.session);
  }
  async lock<T>(
    id: string,
    work: (
      session: InterviewSession,
      metadata: { credentials: number },
    ) => Promise<T>,
  ) {
    const pending = this.queue.then(async () => {
      const row = this.sessions.get(id);
      if (!row || row.owner !== currentAccount().id) throw AppError.notFound();
      const copy = structuredClone(row);
      const result = await work(copy.session, copy);
      this.sessions.set(id, copy);
      return result;
    });
    this.queue = pending.catch(() => {});
    return pending;
  }
}
function fixture() {
  const store = new MemoryStore();
  const gateway = {
    assertAvailable: jest.fn(),
    availability: jest.fn(),
    voicePreview: jest
      .fn()
      .mockResolvedValue({ audio: 'sample-base64', mime: 'audio/mpeg' }),
    question: jest.fn().mockResolvedValue('Tell me about your queues.'),
    evaluate: jest.fn().mockResolvedValue({
      summary: 'Good',
      assessments: [],
      improvements: [],
      strongerAnswer: '',
    }),
    realtime: jest.fn().mockResolvedValue({
      value: 'ephemeral',
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    }),
  };
  const resolver = { resolve: jest.fn().mockResolvedValue(context) };
  const extractor = { extract: jest.fn().mockResolvedValue('A reviewed CV') };
  const service = new InterviewsService(
    store as never,
    resolver as never,
    gateway as never,
    extractor as never,
  );
  return { store, gateway, resolver, service, extractor };
}
const run = <T>(fn: () => T) => withAccount(account, fn);
describe('InterviewsService', () => {
  it('snapshots reviewed context and opens a DeepSeek question in the chosen language', async () => {
    const { service, gateway } = fixture();
    const session = await run(() => service.start(setup));
    expect(session.setup).toEqual(setup);
    expect(session.context).toEqual(context);
    expect(session.turns[0]).toMatchObject({
      role: 'assistant',
      text: 'Tell me about your queues.',
    });
    expect(gateway.question).toHaveBeenCalledTimes(1);
  });
  it('rejects empty context before library queries or provider work', async () => {
    const { store, gateway, extractor } = fixture();
    const query = jest.fn();
    const service = new InterviewsService(
      store as never,
      new InterviewContextResolver({ query } as never),
      gateway as never,
      extractor as never,
    );
    await expect(
      run(() =>
        service.start({
          ...setup,
          source: undefined,
          documentText: undefined,
          filename: undefined,
          documents: [],
          topicIds: [],
          noteIds: [],
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
    expect(gateway.question).not.toHaveBeenCalled();
    expect(gateway.assertAvailable).not.toHaveBeenCalled();
    expect(store.sessions.size).toBe(0);
  });
  it('snapshots both reviewed documents with trimmed text and filenames', async () => {
    const { service } = fixture();
    const s = await run(() =>
      service.start({
        ...setup,
        source: undefined,
        documentText: undefined,
        filename: undefined,
        documents: [
          { source: 'jd', filename: ' jd.pdf ', text: ' Role requirements ' },
          { source: 'cv', filename: 'cv.pdf', text: ' Claimed experience ' },
        ],
      }),
    );
    expect(s.setup.documents).toEqual([
      { source: 'jd', filename: 'jd.pdf', text: 'Role requirements' },
      { source: 'cv', filename: 'cv.pdf', text: 'Claimed experience' },
    ]);
  });
  it('persists a selected browser voice URI in the interview snapshot', async () => {
    const { service } = fixture();
    const session = await run(() =>
      service.start({ ...setup, voice: 'browser://vietnamese-voice' }),
    );
    expect((await run(() => service.get(session.id))).setup.voice).toBe(
      'browser://vietnamese-voice',
    );
  });
  it('previews a voice without creating or changing an interview', async () => {
    const { service, store } = fixture();
    expect(await service.voicePreview({ voice: 'cedar', lang: 'vi' })).toEqual({
      audio: 'sample-base64',
      mime: 'audio/mpeg',
    });
    expect(store.sessions.size).toBe(0);
  });
  it('does not generate an OpenAI text question before connecting voice', async () => {
    const { service, gateway } = fixture();
    const session = await run(() =>
      service.start({ ...setup, provider: 'openai' }),
    );
    expect(session.turns).toEqual([]);
    expect(gateway.question).not.toHaveBeenCalled();
  });
  it('rejects missing credentials before provider calls or persistence', async () => {
    const { service, gateway, store } = fixture();
    gateway.assertAvailable.mockImplementation(() => {
      throw AppError.aiNotConfigured();
    });
    await expect(run(() => service.start(setup))).rejects.toMatchObject({
      status: 503,
    });
    expect(store.sessions.size).toBe(0);
  });
  it('serializes duplicate requests and returns their original answer without paying twice', async () => {
    const { service, gateway } = fixture();
    const started = await run(() => service.start(setup));
    const answer = {
      id: 'answer-1',
      text: 'I used retries.',
      afterTurnId: started.turns[0].id,
    };
    const [a, b] = await run(() =>
      Promise.all([
        service.turn(started.id, answer),
        service.turn(started.id, answer),
      ]),
    );
    expect(a.turns).toEqual(b.turns);
    expect(a.turns).toHaveLength(3);
    expect(gateway.question).toHaveBeenCalledTimes(2);
    await expect(
      run(() => service.turn(started.id, { ...answer, text: 'different' })),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a stale answer against an old question', async () => {
    const { service } = fixture();
    const s = await run(() => service.start(setup));
    const answer = { id: 'a', text: 'answer', afterTurnId: s.turns[0].id };
    await run(() => service.turn(s.id, answer));
    await expect(
      run(() => service.turn(s.id, { ...answer, id: 'b' })),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('never exposes another owner session', async () => {
    const { service } = fixture();
    const s = await run(() => service.start(setup));
    await expect(
      withAccount({ ...account, id: 'other' }, () => service.get(s.id)),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects expired turns and credentials but permits final transcript sync', async () => {
    const { service, store } = fixture();
    const s = await run(() => service.start({ ...setup, provider: 'openai' }));
    store.sessions.get(s.id)!.session.expiresAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    await expect(run(() => service.realtime(s.id))).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await run(() =>
          service.transcript(s.id, [
            { id: 'u1', role: 'user', text: 'last answer' },
          ]),
        )
      ).turns,
    ).toHaveLength(1);
  });
  it('appends OpenAI transcript once and rejects conflicting duplicate event IDs', async () => {
    const { service } = fixture();
    const s = await run(() => service.start({ ...setup, provider: 'openai' }));
    const turns = [{ id: 'u1', role: 'user' as const, text: 'I used queues.' }];
    await run(() => service.transcript(s.id, turns));
    expect(
      (await run(() => service.transcript(s.id, turns))).turns,
    ).toHaveLength(1);
    await expect(
      run(() => service.transcript(s.id, [{ ...turns[0], text: 'changed' }])),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('accepts a full snapshot order correction without dropping turns from stale snapshots', async () => {
    const { service } = fixture();
    const s = await run(() => service.start({ ...setup, provider: 'openai' }));
    const a = { id: 'a1', role: 'assistant' as const, text: 'question' },
      u = { id: 'u1', role: 'user' as const, text: 'answer' };
    await run(() => service.transcript(s.id, [u, a]));
    expect(
      (await run(() => service.transcript(s.id, [a, u]))).turns.map(
        (t) => t.id,
      ),
    ).toEqual(['a1', 'u1']);
    expect(
      (await run(() => service.transcript(s.id, [a]))).turns.map((t) => t.id),
    ).toEqual(['a1', 'u1']);
  });
  it('ends the interview durably even if evaluation fails and can retry feedback', async () => {
    const { service, gateway, store } = fixture();
    const s = await run(() => service.start(setup));
    gateway.evaluate.mockRejectedValueOnce(AppError.aiUpstream());
    await expect(run(() => service.finish(s.id))).rejects.toMatchObject({
      status: 502,
    });
    expect(store.sessions.get(s.id)!.session.status).toBe('finished');
    expect((await run(() => service.finish(s.id))).feedback?.summary).toBe(
      'Good',
    );
    await run(() => service.finish(s.id));
    expect(gateway.evaluate).toHaveBeenCalledTimes(2);
  });
  it('restricts credential creation and transcript ingestion to OpenAI', async () => {
    const { service } = fixture();
    const s = await run(() => service.start(setup));
    await expect(run(() => service.realtime(s.id))).rejects.toMatchObject({
      status: 400,
    });
    await expect(run(() => service.transcript(s.id, []))).rejects.toMatchObject(
      { status: 400 },
    );
  });
  it('rejects oversized or unreadable documents without contacting a provider', async () => {
    const { service, extractor, gateway } = fixture();
    await expect(
      service.prepareDocument({
        buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({ status: 400 });
    extractor.extract.mockResolvedValue(' ');
    await expect(
      service.prepareDocument({
        buffer: Buffer.from('test'),
        originalname: 'cv.pdf',
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(gateway.question).not.toHaveBeenCalled();
  });
});
