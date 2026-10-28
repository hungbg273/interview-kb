import { InterviewGateway, parseFeedback } from './interview-gateway';
import { interviewInstructions } from './interview-prompts';
import { setup } from './interview-fixtures';
import type { InterviewSession } from '@kb/shared';

const session: InterviewSession = {
  id: 'session',
  setup,
  context: {
    subjects: [{ id: 's', name: 'Node.js' }],
    notes: [],
    characters: 100,
  },
  status: 'active',
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  turns: [
    { id: 'u1', role: 'user', text: 'I used queues for background jobs.' },
  ],
  feedback: null,
};
const feedback = {
  summary: 'Useful answer.',
  assessments: ['correctness', 'depth', 'clarity', 'examples'].map(
    (criterion) => ({
      criterion,
      score: 3,
      feedback: 'Explain tradeoffs.',
      evidence: 'I used queues',
    }),
  ),
  improvements: ['Add measurements.'],
  strongerAnswer: 'I used a queue to isolate slow work.',
};
describe('InterviewGateway', () => {
  const originalFetch = global.fetch;
  const env = { ...process.env };
  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...env };
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it('routes DeepSeek turns without needing an OpenAI key and preserves conversation', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    const complete = jest
      .fn()
      .mockResolvedValue('What happens if a job fails?');
    const gateway = new InterviewGateway({ complete } as never);
    expect(gateway.availability().deepseek.available).toBe(true);
    expect(gateway.availability().openai.available).toBe(false);
    expect(await gateway.question(session)).toContain('job fails');
    expect(complete.mock.calls[0][0]).toMatchObject({
      provider: 'deepseek',
      style: '',
    });
    expect(complete.mock.calls[0][0].user).toContain('queues');
  });
  it('includes source, level, language and owned context as reference data', () => {
    const instructions = interviewInstructions(session);
    expect(instructions).toContain('junior');
    expect(instructions).toContain('English');
    expect(instructions).toContain('Node.js');
    expect(instructions).toContain('untrusted reference data');
    expect(instructions).toContain('claimed experience');
    expect(
      interviewInstructions({
        ...session,
        setup: { ...setup, source: 'jd', lang: 'vi' },
      }),
    ).toContain('Vietnamese');
  });
  it('distinguishes combined JD requirements and CV claims, and supports library-only prompts', () => {
    const base = {
      ...setup,
      source: undefined,
      documentText: undefined,
      filename: undefined,
    };
    const combined = interviewInstructions({
      ...session,
      setup: {
        ...base,
        documents: [
          { source: 'jd', filename: 'jd.pdf', text: 'Job requirements' },
          { source: 'cv', filename: 'cv.pdf', text: 'Claimed project' },
        ],
      },
    });
    expect(combined).toContain('role requirements');
    expect(combined).toContain('claimed experience');
    expect(combined).toContain('Job requirements');
    expect(combined).toContain('Claimed project');
    const libraryOnly = interviewInstructions({ ...session, setup: base });
    expect(libraryOnly).toContain('selected subjects and notes only');
    expect(libraryOnly).not.toContain('This is a JD');
    expect(libraryOnly).not.toContain('This is a CV');
  });
  it('creates a bounded ephemeral OpenAI token, without returning the permanent key', async () => {
    process.env.OPENAI_API_KEY = 'permanent-secret';
    const expires = Math.floor(Date.now() / 1000) + 60;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: 'ephemeral',
        expires_at: expires,
        session: { key: 'do-not-return' },
      }),
    }) as never;
    const result = await new InterviewGateway({} as never).realtime({
      ...session,
      setup: { ...setup, provider: 'openai' },
    });
    expect(result).toEqual({ value: 'ephemeral', expiresAt: expires });
    const call = (global.fetch as jest.Mock).mock.calls[0];
    expect(call[0]).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect(
      JSON.parse(call[1].body).session.audio.input.transcription.language,
    ).toBe('en');
    expect(JSON.stringify(result)).not.toContain('permanent-secret');
  });
  it('uses the selected OpenAI voice and keeps Marin for legacy sessions', async () => {
    process.env.OPENAI_API_KEY = 'key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: 'ephemeral',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      }),
    }) as never;
    const gateway = new InterviewGateway({} as never);
    await gateway.realtime({
      ...session,
      setup: { ...setup, provider: 'openai', voice: 'cedar' },
    });
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).session
        .audio.output.voice,
    ).toBe('cedar');
    await gateway.realtime({
      ...session,
      setup: { ...setup, provider: 'openai' },
    });
    expect(
      JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).session
        .audio.output.voice,
    ).toBe('marin');
  });
  it('previews a fixed localized sample with bounded base64 MPEG output', async () => {
    process.env.OPENAI_API_KEY = 'secret';
    process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
    const audio = Buffer.from('ID3sample');
    global.fetch = jest.fn().mockResolvedValue(
      new Response(audio, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    ) as never;
    const result = await new InterviewGateway({} as never).voicePreview({
      voice: 'cedar',
      lang: 'vi',
    });
    expect(result).toEqual({
      audio: audio.toString('base64'),
      mime: 'audio/mpeg',
    });
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: 'gpt-4o-mini-tts',
      voice: 'cedar',
      response_format: 'mp3',
    });
    expect(body.input).toContain('Xin chào');
    expect(body.instructions).toContain('Vietnamese');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('rejects invalid voice previews without contacting OpenAI', async () => {
    const fetch = jest.fn();
    global.fetch = fetch as never;
    process.env.OPENAI_API_KEY = 'key';
    const gateway = new InterviewGateway({} as never);
    await expect(
      gateway.voicePreview({ voice: 'browser-voice', lang: 'en' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      gateway.voicePreview({ voice: 'marin', lang: 'fr' as never }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['insufficient_quota', 'credit_balance_exhausted'])(
    'maps %s preview errors to actionable billing guidance without leaking keys',
    async (code) => {
      process.env.OPENAI_API_KEY = 'sk-secret';
      global.fetch = jest
        .fn()
        .mockImplementation(
          async () =>
            new Response(
              JSON.stringify({ error: { code, message: 'sk-secret' } }),
              { status: 429 },
            ),
        ) as never;
      try {
        await new InterviewGateway({} as never).voicePreview({
          voice: 'marin',
          lang: 'en',
        });
        throw new Error('Expected a billing error');
      } catch (error) {
        expect(error).toMatchObject({ code: 'AI_UPSTREAM' });
        const body = (error as { getResponse: () => unknown }).getResponse();
        expect(body).toMatchObject({
          error: { message: expect.stringContaining('billing') },
        });
        expect(JSON.stringify(body)).not.toContain('sk-secret');
      }
    },
  );
  it('bounds voice preview requests with a timeout', async () => {
    jest.useFakeTimers();
    process.env.OPENAI_API_KEY = 'key';
    global.fetch = jest.fn(
      (_url: unknown, request: RequestInit) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    ) as never;
    const pending = new InterviewGateway({} as never).voicePreview({
      voice: 'marin',
      lang: 'en',
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(15000);
    await assertion;
  });
  it('does not contact OpenAI when preview credentials are missing', async () => {
    delete process.env.OPENAI_API_KEY;
    global.fetch = jest.fn() as never;
    await expect(
      new InterviewGateway({} as never).voicePreview({
        voice: 'marin',
        lang: 'en',
      }),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('rejects empty or non-audio preview responses', async () => {
    process.env.OPENAI_API_KEY = 'key';
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('wrong', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        }),
      ) as never;
    const gateway = new InterviewGateway({} as never);
    await expect(
      gateway.voicePreview({ voice: 'marin', lang: 'en' }),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
    await expect(
      gateway.voicePreview({ voice: 'marin', lang: 'en' }),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
  });
  it('rejects oversized audio without returning it', async () => {
    process.env.OPENAI_API_KEY = 'key';
    global.fetch = jest.fn().mockResolvedValue(
      new Response(Buffer.alloc(1024 * 1024 + 1), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    ) as never;
    await expect(
      new InterviewGateway({} as never).voicePreview({
        voice: 'marin',
        lang: 'en',
      }),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
  });
  it('preserves recorded conversation context when reconnecting native voice', async () => {
    process.env.OPENAI_API_KEY = 'permanent-secret';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        value: 'ephemeral',
        expires_at: Math.floor(Date.now() / 1000) + 60,
      }),
    }) as never;
    await new InterviewGateway({} as never).realtime({
      ...session,
      setup: { ...setup, provider: 'openai' },
    });
    const instructions = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    ).session.instructions;
    expect(instructions).toContain('I used queues for background jobs.');
    expect(instructions).toContain('Do not repeat the introduction');
  });
  it('uses a dedicated current DeepSeek model without changing existing features', async () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    delete process.env.INTERVIEW_DEEPSEEK_MODEL;
    const complete = jest.fn().mockResolvedValue('What tradeoff did you make?');
    const gateway = new InterviewGateway({ complete } as never);
    await gateway.question(session);
    expect(complete.mock.calls[0][0].model).toBe('deepseek-flash');
    process.env.INTERVIEW_DEEPSEEK_MODEL = 'custom-interview-model';
    await gateway.question(session);
    expect(complete.mock.calls[1][0].model).toBe('custom-interview-model');
  });
  it('maps provider failure without leaking response details', async () => {
    process.env.OPENAI_API_KEY = 'secret';
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, text: async () => 'secret' }) as never;
    await expect(
      new InterviewGateway({} as never).realtime({
        ...session,
        setup: { ...setup, provider: 'openai' },
      }),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
  });
  it('validates assessment scores, required criteria and transcript evidence', () => {
    expect(parseFeedback(JSON.stringify(feedback), session.turns)).toEqual(
      feedback,
    );
    expect(() =>
      parseFeedback(
        JSON.stringify({ ...feedback, assessments: [] }),
        session.turns,
      ),
    ).toThrow();
    expect(() =>
      parseFeedback(
        JSON.stringify({
          ...feedback,
          assessments: feedback.assessments.map((a) => ({ ...a, score: 99 })),
        }),
        session.turns,
      ),
    ).toThrow();
    expect(() =>
      parseFeedback(
        JSON.stringify({
          ...feedback,
          assessments: feedback.assessments.map((a) => ({
            ...a,
            evidence: 'invented quote',
          })),
        }),
        session.turns,
      ),
    ).toThrow();
  });
});
