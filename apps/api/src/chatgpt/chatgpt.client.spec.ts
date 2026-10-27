import { ChatgptClient } from './chatgpt.client';
import { ChatgptConnection } from './chatgpt.connection';
describe('ChatGPT inference', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  function setup(events: unknown[]) {
    const connection = {
      credential: jest.fn().mockResolvedValue({
        accessToken: 'personal-token',
        model: 'account-model',
      }),
      models: jest.fn().mockResolvedValue([{ id: 'account-model' }]),
    };
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          events
            .map((value) => 'data: ' + JSON.stringify(value) + '\n\n')
            .join(''),
        ),
      );
    return {
      client: new ChatgptClient(connection as unknown as ChatgptConnection),
      connection,
    };
  }
  it('uses the personal token, account model, stateless streaming Responses payload', async () => {
    const { client } = setup([
      { type: 'response.output_text.delta', delta: 'Xin chào' },
      { type: 'response.completed' },
    ]);
    expect(
      await client.complete({
        owner: 'a@example.com',
        system: 'Help',
        user: 'Hi',
        json: true,
      }),
    ).toBe('Xin chào');
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.Authorization).toBe('Bearer personal-token');
    expect(JSON.parse(init.body)).toEqual({
      model: 'account-model',
      store: false,
      stream: true,
      instructions: expect.stringContaining('JSON'),
      input: [{ role: 'user', content: 'Hi' }],
    });
  });
  it('rejects an interrupted stream instead of applying partial content', async () => {
    const { client } = setup([
      { type: 'response.output_text.delta', delta: 'partial' },
    ]);
    await expect(
      client.complete({ owner: 'a', system: '', user: '' }),
    ).rejects.toMatchObject({ code: 'AI_UPSTREAM' });
  });
  it('reports plan exhaustion even after text deltas', async () => {
    const { client } = setup([
      { type: 'response.output_text.delta', delta: 'partial' },
      {
        type: 'response.failed',
        response: {
          error: { code: 'subscription_sharing_usage_limit_exceeded' },
        },
      },
    ]);
    await expect(
      client.complete({ owner: 'a', system: '', user: '' }),
    ).rejects.toMatchObject({ code: 'CHATGPT_USAGE_LIMIT' });
  });
  it('recognizes top-level SSE usage errors', async () => {
    const { client } = setup([
      { type: 'error', code: 'subscription_sharing_usage_unavailable' },
    ]);
    await expect(
      client.complete({ owner: 'a', system: '', user: '' }),
    ).rejects.toMatchObject({ code: 'CHATGPT_USAGE_UNAVAILABLE' });
  });
  it('never falls back to an owner API key when disconnected', async () => {
    const { client, connection } = setup([]);
    connection.credential.mockRejectedValue(new Error('disconnected'));
    await expect(
      client.complete({ owner: 'a', system: '', user: '' }),
    ).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
