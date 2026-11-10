import { AppError } from '../common/app-error';
import { withAccount } from '../accounts/account-context';
import { MeetingsService } from './meetings.service';
import { MeetingSessions } from './meeting-sessions';

const alice = {
  id: 'alice',
  email: 'alice@example.test',
  displayName: 'Alice',
};
const bob = { ...alice, id: 'bob' };
const setup = {
  provider: 'openai' as const,
  sourceLang: 'en' as const,
  targetLang: 'vi' as const,
  context: { personal: 'Frontend engineer', project: 'Waiting for API' },
};
const wav = Buffer.from('validated in AI client');

describe('MeetingsService', () => {
  let sessions: MeetingSessions;
  let ai: {
    assertAvailable: jest.Mock;
    transcribe: jest.Mock;
    translate: jest.Mock;
    suggest: jest.Mock;
  };
  let service: MeetingsService;
  beforeEach(() => {
    sessions = new MeetingSessions();
    ai = {
      assertAvailable: jest.fn(),
      transcribe: jest.fn().mockResolvedValue('When can you finish?'),
      translate: jest.fn().mockResolvedValue('Khi nào bạn hoàn thành?'),
      suggest: jest.fn().mockResolvedValue({
        reply: 'I am waiting for the API.',
        explanation: 'Chưa có lịch.',
      }),
    };
    service = new MeetingsService(sessions, ai as never);
  });
  afterEach(() => {
    sessions.onModuleDestroy();
    jest.useRealTimers();
  });
  const asAlice = <T>(work: () => T) => withAccount(alice, work);
  it('requires an account and isolates session lookup and stop by owner', () => {
    expect(() => service.start(setup)).toThrow();
    const session = asAlice(() => service.start(setup));
    expect(() => withAccount(bob, () => service.get(session.id))).toThrow(
      AppError,
    );
    withAccount(bob, () => service.stop(session.id));
    expect(asAlice(() => service.get(session.id)).id).toBe(session.id);
  });
  it('limits active sessions per account and forgets data on stop', () => {
    const session = asAlice(() => service.start(setup));
    expect(() => asAlice(() => service.start(setup))).toThrow(AppError);
    expect(asAlice(() => service.stop(session.id))).toEqual({
      status: 'stopped',
    });
    expect(asAlice(() => service.stop(session.id))).toEqual({
      status: 'stopped',
    });
    expect(() => asAlice(() => service.get(session.id))).toThrow(AppError);
    expect(asAlice(() => service.start(setup)).id).not.toBe(session.id);
  });
  it('expires sessions and aborts work at the deadline', async () => {
    jest.useFakeTimers();
    const session = asAlice(() => service.start(setup));
    jest.setSystemTime(Date.parse(session.expiresAt) - 1000);
    let signal!: AbortSignal;
    ai.transcribe.mockImplementation((_audio, _lang, value) => {
      signal = value;
      return new Promise((resolve) =>
        value.addEventListener('abort', () => resolve('late')),
      );
    });
    const pending = asAlice(() => service.audio(session.id, 0, wav));
    const rejected = expect(pending).rejects.toThrow();
    await jest.advanceTimersByTimeAsync(1001);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(ai.translate).not.toHaveBeenCalled();
    expect(() => asAlice(() => service.get(session.id))).toThrow();
  });
  it('transcribes, translates and returns matching retries without charging again', async () => {
    const session = asAlice(() => service.start(setup));
    const result = await asAlice(() => service.audio(session.id, 0, wav));
    expect(result).toMatchObject({
      sequence: 0,
      text: 'When can you finish?',
      translation: 'Khi nào bạn hoàn thành?',
    });
    expect(await asAlice(() => service.audio(session.id, 0, wav))).toEqual(
      result,
    );
    expect(ai.transcribe).toHaveBeenCalledTimes(1);
    await expect(
      asAlice(() => service.audio(session.id, 0, Buffer.from('different'))),
    ).rejects.toMatchObject({
      response: { error: { message: expect.stringContaining('sequence') } },
    });
    await expect(
      asAlice(() => service.audio(session.id, 2, wav)),
    ).rejects.toMatchObject({
      response: { error: { message: expect.stringContaining('sequence') } },
    });
    expect(asAlice(() => service.get(session.id)).segments).toEqual([result]);
  });
  it('keeps failed sequence retryable and does not append partial transcripts', async () => {
    const session = asAlice(() => service.start(setup));
    ai.translate.mockRejectedValueOnce(new Error('upstream'));
    await expect(
      asAlice(() => service.audio(session.id, 0, wav)),
    ).rejects.toThrow('upstream');
    expect(asAlice(() => service.get(session.id)).nextSequence).toBe(0);
    await asAlice(() => service.audio(session.id, 0, wav));
    expect(asAlice(() => service.get(session.id)).nextSequence).toBe(1);
  });
  it('rejects parallel work and context edits; stop cancels before translation', async () => {
    const session = asAlice(() => service.start(setup));
    let resolve!: (value: string) => void;
    let signal!: AbortSignal;
    ai.transcribe.mockImplementation((_audio, _lang, value) => {
      signal = value;
      return new Promise((r) => {
        resolve = r;
      });
    });
    const pending = asAlice(() => service.audio(session.id, 0, wav));
    await expect(
      asAlice(() => service.suggest(session.id, { draft: 'hello' })),
    ).rejects.toThrow(AppError);
    expect(() => asAlice(() => service.context(session.id, {}))).toThrow(
      AppError,
    );
    asAlice(() => service.stop(session.id));
    expect(signal.aborted).toBe(true);
    resolve('late transcript');
    await expect(pending).rejects.toThrow();
    expect(ai.translate).not.toHaveBeenCalled();
  });
  it('uses selected context and recent transcript for replies and replaces context', async () => {
    const session = asAlice(() => service.start(setup));
    await expect(
      asAlice(() => service.suggest(session.id, {})),
    ).rejects.toMatchObject({
      response: {
        error: { message: expect.stringContaining('speech or a draft') },
      },
    });
    await asAlice(() => service.audio(session.id, 0, wav));
    asAlice(() => service.context(session.id, { meeting: 'Discuss delivery' }));
    await asAlice(() =>
      service.suggest(session.id, { draft: 'Tôi đang chờ API' }),
    );
    expect(ai.suggest.mock.calls[0][0]).toMatchObject({
      context: { meeting: 'Discuss delivery' },
      segments: [{ text: 'When can you finish?' }],
    });
    expect(ai.suggest.mock.calls[0][1]).toBe('Tôi đang chờ API');
    await expect(
      asAlice(() => service.suggest(session.id, { draft: 'again' })),
    ).rejects.toMatchObject({
      response: { error: { message: expect.stringContaining('2 seconds') } },
    });
  });
  it('aborts provider work on client disconnect', async () => {
    const session = asAlice(() => service.start(setup));
    const client = new AbortController();
    ai.transcribe.mockImplementation(
      (_audio, _lang, signal: AbortSignal) =>
        new Promise((resolve) =>
          signal.addEventListener('abort', () => resolve('late')),
        ),
    );
    const pending = asAlice(() =>
      service.audio(session.id, 0, wav, client.signal),
    );
    client.abort();
    await expect(pending).rejects.toThrow();
    expect(ai.translate).not.toHaveBeenCalled();
  });
  it('bounds recent history and stops billing after the session operation budget', async () => {
    const session = asAlice(() => service.start(setup));
    for (let sequence = 0; sequence < 1600; sequence++)
      await asAlice(() => service.audio(session.id, sequence, wav));
    const view = asAlice(() => service.get(session.id));
    expect(view.segments).toHaveLength(50);
    expect(view.segments[0].sequence).toBe(1550);
    await expect(
      asAlice(() => service.audio(session.id, 1600, wav)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(ai.transcribe).toHaveBeenCalledTimes(1600);
  });
  it('limits total live sessions and releases capacity after shutdown', () => {
    for (let index = 0; index < 100; index++)
      withAccount({ ...alice, id: `owner-${index}` }, () =>
        service.start(setup),
      );
    expect(() => asAlice(() => service.start(setup))).toThrow(AppError);
    sessions.onModuleDestroy();
    expect(asAlice(() => service.start(setup)).status).toBe('active');
  });
  it('counts failed attempts toward the budget', async () => {
    const session = asAlice(() => service.start(setup));
    ai.transcribe.mockRejectedValue(new Error('provider failed'));
    for (let attempt = 0; attempt < 1600; attempt++)
      await expect(
        asAlice(() => service.audio(session.id, 0, wav)),
      ).rejects.toThrow('provider failed');
    await expect(
      asAlice(() => service.audio(session.id, 0, wav)),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(ai.transcribe).toHaveBeenCalledTimes(1600);
  });
});

describe('caption text ingestion', () => {
  let sessions: MeetingSessions;
  const ai = {
    assertAvailable: jest.fn(),
    transcribe: jest.fn(),
    translate: jest.fn().mockResolvedValue('Xin chào'),
    suggest: jest.fn(),
  };
  let service: MeetingsService;
  beforeEach(() => {
    sessions = new MeetingSessions();
    service = new MeetingsService(sessions, ai as never);
    jest.clearAllMocks();
  });
  afterEach(() => sessions.onModuleDestroy());
  const own = <T>(f: () => T) => withAccount(alice, f);
  const config = { ...setup, inputMode: 'captions' as const };
  it('accepts caption text, caches identical retries and replaces interim utterances', async () => {
    const session = own(() => service.start(config));
    const caption = {
      sequence: 0,
      utteranceId: 'utterance-1',
      text: 'Hello',
      speaker: 'Alice',
    };
    const first = await own(() => service.caption(session.id, caption));
    expect(first).toMatchObject({
      text: 'Hello',
      speaker: 'Alice',
      utteranceId: 'utterance-1',
    });
    expect(await own(() => service.caption(session.id, caption))).toEqual(
      first,
    );
    expect(ai.translate).toHaveBeenCalledTimes(1);
    await own(() =>
      service.caption(session.id, {
        ...caption,
        sequence: 1,
        text: 'Hello everyone',
      }),
    );
    expect(own(() => service.get(session.id)).segments).toHaveLength(1);
    expect(own(() => service.get(session.id)).segments[0].text).toBe(
      'Hello everyone',
    );
    await expect(
      own(() =>
        service.caption(session.id, {
          ...caption,
          sequence: 1,
          text: 'different',
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      own(() => service.audio(session.id, 2, wav)),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(ai.transcribe).not.toHaveBeenCalled();
  });
});
