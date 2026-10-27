import { ERROR_CODES } from '@kb/shared';
import { AppError } from '../common/app-error';
import { LlmClient, providerConfig } from './llm.client';

describe('providerConfig', () => {
  const env = {
    OPENAI_API_KEY: 'sk-o',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    OPENAI_MODEL: 'gpt-4o-mini',
    DEEPSEEK_API_KEY: 'sk-d',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    DEEPSEEK_MODEL: 'deepseek-chat',
  };

  it('maps openai', () => {
    const c = providerConfig('openai', env);
    expect(c.baseUrl).toContain('openai.com');
    expect(c.apiKey).toBe('sk-o');
  });

  it('maps deepseek', () => {
    const c = providerConfig('deepseek', env);
    expect(c.baseUrl).toContain('deepseek.com');
    expect(c.apiKey).toBe('sk-d');
  });
});

describe('LlmClient', () => {
  const originalFetch = global.fetch;
  const client = new LlmClient();

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('throws AI_NOT_CONFIGURED when the selected provider key is missing', async () => {
    await expect(
      client.complete({
        provider: 'openai',
        env: { OPENAI_API_KEY: '' },
        system: 's',
        user: 'u',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.AI_NOT_CONFIGURED, status: 503 });
  });

  it('maps non-OK provider response to AI_UPSTREAM without leaking the key', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'sk-secret-should-not-leak' }),
    }) as never;

    try {
      await client.complete({
        provider: 'openai',
        env: { OPENAI_API_KEY: 'sk-secret-should-not-leak' },
        system: 's',
        user: 'u',
      });
      throw new Error('expected AI_UPSTREAM');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe(ERROR_CODES.AI_UPSTREAM);
      expect(err.getStatus()).toBe(502);
      expect(JSON.stringify(err.getResponse())).not.toContain('sk-secret');
    }
  });

  it('maps abort after 30s to AI_TIMEOUT', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn((_url: unknown, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const onAbort = () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (init.signal?.aborted) onAbort();
        else init.signal?.addEventListener('abort', onAbort);
      });
    }) as never;

    const pending = client.complete({
      provider: 'openai',
      env: { OPENAI_API_KEY: 'sk' },
      system: 's',
      user: 'u',
    });
    const expectation = expect(pending).rejects.toMatchObject({
      code: ERROR_CODES.AI_TIMEOUT,
    });
    await jest.advanceTimersByTimeAsync(30_000);
    await expectation;
  });

  it('sends json_object, max_tokens, and temperature when asked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"items":[]}' } }] }),
    }) as never;

    await client.complete({
      provider: 'openai',
      env: { OPENAI_API_KEY: 'sk' },
      system: 's',
      user: 'u',
      json: true,
      maxTokens: 800,
      temperature: 0,
    });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string) as {
      response_format?: { type: string };
      max_tokens?: number;
      temperature?: number;
    };
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(800);
    expect(body.temperature).toBe(0);
  });
});


describe('shared Vietnamese writing instructions', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  it('includes compact style on every ChatGPT call without modifying task or user input', async () => {
    const complete = jest.fn().mockResolvedValue('result');
    const client = new LlmClient({ complete } as never);
    for (let i=0; i<2; i++) await client.complete({provider:'chatgpt',env:{},system:'Return JSON. Language: English.',user:'My note',json:true,owner:'person@example.com'});
    for(const [request] of complete.mock.calls){
      expect(request.system).toContain('Khi viết tiếng Việt');
      expect(request.system).toContain('Giữ nguyên ngôn ngữ được yêu cầu');
      expect(request.system).toContain('Return JSON. Language: English.');
      expect(request.system.match(/Khi viết tiếng Việt/g)).toHaveLength(1);
      expect(request.user).toBe('My note');expect(request.json).toBe(true);expect(request.owner).toBe('person@example.com');
    }
  });
  it.each(['openai','deepseek'] as const)('includes the same style in %s system instructions',async provider=>{
    global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:'result'}}]})});
    await new LlmClient().complete({provider,env:{OPENAI_API_KEY:'test',DEEPSEEK_API_KEY:'test'},system:'Translate into English. Keep structure.',user:'Source'});
    const body=JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('Khi viết tiếng Việt');
    expect(body.messages[0].content).toContain('Translate into English. Keep structure.');
    expect(body.messages[1]).toEqual({role:'user',content:'Source'});
  });
});
