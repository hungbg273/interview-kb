import { MeetingAi, validateMeetingWav } from './meeting-ai';

export function validWav(seconds = 1) {
  const bytes = 32000 * seconds;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF');
  b.writeUInt32LE(36 + bytes, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}
const setup = {
  provider: 'openai' as const,
  sourceLang: 'en' as const,
  targetLang: 'vi' as const,
  context: { personal: 'Engineer', participants: 'Client' },
  segments: [{ sequence: 0, text: 'When?', translation: 'Khi nào?' }],
};
describe('MeetingAi', () => {
  const env = { ...process.env };
  const originalFetch = global.fetch;
  afterEach(() => {
    process.env = { ...env };
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  it('accepts only complete canonical PCM WAV segments with truthful bounded duration', () => {
    expect(() => validateMeetingWav(validWav())).not.toThrow();
    for (const audio of [
      Buffer.from('webm'),
      validWav(0),
      validWav(11),
      validWav().subarray(0, 100),
    ])
      expect(() => validateMeetingWav(audio)).toThrow();
    const stereo = validWav();
    stereo.writeUInt16LE(2, 22);
    expect(() => validateMeetingWav(stereo)).toThrow();
  });
  it('uploads WAV to configured speech endpoint with cancellation and no permanent key response', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ text: 'Hello' })));
    const ai = new MeetingAi({ complete: jest.fn() } as never);
    const signal = new AbortController().signal;
    expect(await ai.transcribe(validWav(), 'en', signal)).toBe('Hello');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/audio\/transcriptions$/);
    expect(options.signal).toBe(signal);
    expect(options.body.get('file').name).toBe('meeting.wav');
    expect(options.body.get('language')).toBe('en');
  });
  it('rejects malformed, oversized and provider error responses without leaking bodies', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const ai = new MeetingAi({ complete: jest.fn() } as never);
    for (const response of [
      new Response('private provider detail', { status: 500 }),
      new Response('{broken'),
      new Response(JSON.stringify({ text: 42 })),
      new Response('x'.repeat(20000)),
    ]) {
      global.fetch = jest.fn().mockResolvedValue(response);
      await expect(
        ai.transcribe(validWav(), 'en', new AbortController().signal),
      ).rejects.toThrow();
    }
  });
  it('does not invoke speech for invalid audio or missing credentials', async () => {
    global.fetch = jest.fn();
    const ai = new MeetingAi({ complete: jest.fn() } as never);
    delete process.env.OPENAI_API_KEY;
    await expect(
      ai.transcribe(validWav(), 'en', new AbortController().signal),
    ).rejects.toThrow();
    process.env.OPENAI_API_KEY = 'test-key';
    await expect(
      ai.transcribe(Buffer.from('bad'), 'en', new AbortController().signal),
    ).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('keeps untrusted context outside instructions and validates suggested reply JSON', async () => {
    const complete = jest.fn().mockResolvedValue(
      JSON.stringify({
        reply: 'Let me check.',
        explanation: 'Cần xác nhận.',
      }),
    );
    const ai = new MeetingAi({ complete } as never);
    expect(
      await ai.suggest(setup, 'Kiểm tra lại', new AbortController().signal),
    ).toEqual({ reply: 'Let me check.', explanation: 'Cần xác nhận.' });
    const request = complete.mock.calls[0][0];
    expect(request.system).toContain('untrusted');
    expect(request.system).toContain('commitments');
    expect(request.system).not.toContain('Engineer');
    expect(JSON.parse(request.user)).toMatchObject({
      context: setup.context,
      draft: 'Kiểm tra lại',
    });
    expect(request.style).toBe('');
    complete.mockResolvedValue('{"reply":42}');
    await expect(
      ai.suggest(setup, '', new AbortController().signal),
    ).rejects.toThrow();
  });
  it('returns original for same-language translation and rejects empty translation output', async () => {
    const complete = jest.fn().mockResolvedValue('   ');
    const ai = new MeetingAi({ complete } as never);
    expect(
      await ai.translate(
        { ...setup, targetLang: 'en' },
        'Hello',
        new AbortController().signal,
      ),
    ).toBe('Hello');
    expect(complete).not.toHaveBeenCalled();
    await expect(
      ai.translate(setup, 'Hello', new AbortController().signal),
    ).rejects.toThrow();
  });
});

describe('caption provider configuration', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  it('allows caption translation with DeepSeek alone and still requires OpenAI for audio', () => {
    delete process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test';
    const ai = new MeetingAi({ complete: jest.fn() } as never);
    expect(() => ai.assertAvailable('deepseek', 'captions')).not.toThrow();
    expect(() => ai.assertAvailable('deepseek', 'audio')).toThrow();
  });
});

describe('context-aware caption translation', () => {
  it('uses bounded recent speech and terminology as untrusted reference, retaining the original caption', async () => {
    const complete = jest
      .fn()
      .mockResolvedValue('Bộ nhớ đệm Redis đã sẵn sàng.');
    const ai = new MeetingAi({ complete } as never);
    const input = {
      ...setup,
      context: { project: 'Terminology: Redis cache' },
      segments: Array.from({ length: 12 }, (_, i) => ({
        sequence: i,
        text: `prior-${i}`,
        translation: '',
      })),
    };
    await ai.translate(
      input,
      'The ready cash is ready',
      new AbortController().signal,
    );
    const call = complete.mock.calls[0][0];
    const data = JSON.parse(call.user);
    expect(data.context.project).toBe('Terminology: Redis cache');
    expect(data.recentTranscript).toHaveLength(6);
    expect(data.text).toBe('The ready cash is ready');
    expect(call.system).toContain('uncertain');
    expect(call.system).toContain('untrusted');
  });
});
