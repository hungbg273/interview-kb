import { LlmClient, providerConfig } from './llm.client';

describe('provider timeout budget', () => {
  const fetchBefore = global.fetch;
  afterEach(() => {
    global.fetch = fetchBefore;
    jest.useRealTimers();
  });

  it.each([
    [undefined, 120000],
    ['90000', 90000],
    ['999999', 120000],
    ['500', 1000],
    ['invalid', 120000],
    ['0', 120000],
  ])('bounds the DeepSeek timeout (%s)', (value, expected) => {
    expect(
      providerConfig('deepseek', { DEEPSEEK_TIMEOUT_MS: value }),
    ).toHaveProperty('timeoutMs', expected);
    expect(
      providerConfig('openai', { DEEPSEEK_TIMEOUT_MS: value }),
    ).toHaveProperty('timeoutMs', 30000);
  });

  it('accepts a DeepSeek result that takes longer than 30 seconds', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url, init) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  choices: [
                    { message: { content: 'Long generation completed' } },
                  ],
                }),
              } as Response),
            45000,
          );
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const pending = new LlmClient().complete({
      provider: 'deepseek',
      env: { DEEPSEEK_API_KEY: 'test' },
      system: 's',
      user: 'u',
    });
    const result = expect(pending).resolves.toBe('Long generation completed');
    await jest.advanceTimersByTimeAsync(45000);
    await result;
  });

  it('times out the response body at the configured DeepSeek deadline', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      async (_url, init) =>
        ({
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError')),
              );
            }),
        }) as Response,
    );
    const pending = new LlmClient().complete({
      provider: 'deepseek',
      env: { DEEPSEEK_API_KEY: 'test', DEEPSEEK_TIMEOUT_MS: '90000' },
      system: 's',
      user: 'u',
    });
    const result = expect(pending).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(89999);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    await result;
  });

  it('honors caller cancellation before the provider deadline', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const pending = new LlmClient().complete({
      provider: 'deepseek',
      env: { DEEPSEEK_API_KEY: 'test' },
      system: 's',
      user: 'u',
      signal: controller.signal,
    });
    const result = expect(pending).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
    });
    controller.abort();
    await result;
  });
});
