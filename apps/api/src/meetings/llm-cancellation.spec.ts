import { LlmClient } from '../ai/llm.client';
describe('Meeting LLM cancellation', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  const options = {
    provider: 'openai' as const,
    env: { OPENAI_API_KEY: 'test' },
    system: 'Translate.',
    user: 'Hello',
  };
  it('does not send an already cancelled request', async () => {
    global.fetch = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      new LlmClient().complete({ ...options, signal: controller.signal }),
    ).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('propagates caller cancellation into the network request', async () => {
    let network!: AbortSignal;
    global.fetch = jest.fn().mockImplementation((_url, opts) => {
      network = opts.signal;
      return new Promise((_resolve, reject) =>
        network.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        ),
      );
    });
    const controller = new AbortController();
    const pending = new LlmClient().complete({
      ...options,
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toThrow();
    controller.abort();
    await rejected;
    expect(network.aborted).toBe(true);
  });
});
