import { detectPlatform, TranscriptClient } from './transcript.client';

describe('detectPlatform', () => {
  it('maps supported hosts', () => {
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube');
    expect(detectPlatform('https://www.youtube.com/watch?v=abc')).toBe(
      'youtube',
    );
    expect(detectPlatform('https://www.tiktok.com/@u/video/123')).toBe(
      'tiktok',
    );
    expect(detectPlatform('https://www.facebook.com/reel/123')).toBe(
      'facebook',
    );
  });
  it('rejects unsupported or invalid hosts', () => {
    expect(() => detectPlatform('https://vimeo.com/123')).toThrow();
    expect(() => detectPlatform('not a url')).toThrow();
  });
});

describe('TranscriptClient', () => {
  const realFetch = global.fetch;
  const realKey = process.env.TRANSCRIPT_API_KEY;
  beforeEach(() => {
    process.env.TRANSCRIPT_API_KEY = 'test-key';
  });
  afterEach(() => {
    global.fetch = realFetch;
    process.env.TRANSCRIPT_API_KEY = realKey;
    jest.restoreAllMocks();
  });

  const jsonResponse = (status: number, body: unknown): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response;

  it('returns transcript text on a 200 response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { content: 'hello world\u0000', lang: 'en' }),
      ) as never;
    const result = await new TranscriptClient().fetch(
      'https://youtu.be/abc',
    );
    expect(result).toEqual({ platform: 'youtube', text: 'hello world' });
  });

  it('polls a 202 job until completed', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(202, { jobId: 'j1' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'active' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { status: 'completed', content: 'done text' }),
      );
    global.fetch = fetchMock as never;
    const result = await new TranscriptClient().fetch(
      'https://www.tiktok.com/@u/video/1',
    );
    expect(result.text).toBe('done text');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws when the API key is missing', async () => {
    process.env.TRANSCRIPT_API_KEY = '';
    await expect(
      new TranscriptClient().fetch('https://youtu.be/abc'),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('treats 403/404 as unavailable (not retryable upstream)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(404, {})) as never;
    await expect(
      new TranscriptClient().fetch('https://youtu.be/abc'),
    ).rejects.toMatchObject({ code: 'VIDEO_UNAVAILABLE' });
  });

  it('maps 5xx to a retryable upstream error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(500, {})) as never;
    await expect(
      new TranscriptClient().fetch('https://youtu.be/abc'),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
  });

  it('rejects when the transcript is empty', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { content: '' })) as never;
    await expect(
      new TranscriptClient().fetch('https://youtu.be/abc'),
    ).rejects.toMatchObject({ code: 'VIDEO_NO_TRANSCRIPT' });
  });

  it('rejects unsupported platforms before calling the API', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as never;
    await expect(
      new TranscriptClient().fetch('https://vimeo.com/1'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
