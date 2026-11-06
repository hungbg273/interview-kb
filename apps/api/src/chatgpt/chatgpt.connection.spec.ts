import { generateKeyPairSync, sign } from 'node:crypto';
import { ChatgptConnection } from './chatgpt.connection';
import { ChatgptStore, ChatgptCredential } from './chatgpt.store';
import { PLAN_SCOPE } from './chatgpt.identity';
const initial: ChatgptCredential = {
  clientId: 'issued',
  subject: 'person',
  email: 'person@example.com',
  accessToken: 'old-access',
  refreshToken: 'old-refresh',
  idToken: '',
  expiresAt: 0,
  scopes: [PLAN_SCOPE, 'resource.invoke'],
};
function setup() {
  let value: ChatgptCredential | null = { ...initial };
  const store = {
    read: jest.fn(async () => value),
    save: jest.fn(async (_owner: string, next: ChatgptCredential) => {
      value = next;
    }),
    hostId: jest.fn(async () => 'urn:uuid:stable'),
  };
  return {
    connection: new ChatgptConnection(store as unknown as ChatgptStore),
    store,
  };
}
describe('ChatGPT connection lifecycle', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.restoreAllMocks();
  });
  it('binds a one-time handoff to browser cookie, PKCE and stable registration', async () => {
    const { connection } = setup();
    const start = await connection.begin('owner', '//evil.test');
    const ticket = new URL(start.url).searchParams.get('ticket')!;
    const auth = await connection.authorize(ticket);
    const params = new URL(auth.url).searchParams;
    expect(params.get('client_id')).toBe('issued');
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toHaveLength(43);
    expect(params.get('ext_agent_host_id')).toBe('urn:uuid:stable');
    expect(params.get('nonce')).toBeTruthy();
    await expect(connection.authorize(ticket)).rejects.toThrow();
    await expect(
      connection.finish(
        { state: params.get('state')!, code: 'code' },
        'wrong-cookie',
      ),
    ).rejects.toThrow();
  });
  it.each([
    ['http://localhost:3000', 4000],
    ['https://app.interviewbase.site', 18080],
  ])(
    'completes browser-bound OAuth for %s through loopback port %s',
    async (origin, port) => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        WEB_ORIGIN: origin,
        CHATGPT_REDIRECT_URI: 'http://127.0.0.1:4000/chatgpt/callback',
      });
      const { connection, store } = setup();
      const start = await Reflect.apply(connection.begin, connection, [
        'owner',
        '/notes/example',
        port,
      ]);
      expect(new URL(start.url).origin).toBe(`http://127.0.0.1:${port}`);
      const auth = await connection.authorize(
        new URL(start.url).searchParams.get('ticket')!,
      );
      const params = new URL(auth.url).searchParams;
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const header = Buffer.from(
        JSON.stringify({ alg: 'RS256', kid: 'test' }),
      ).toString('base64url');
      const claims = Buffer.from(
        JSON.stringify({
          iss: 'https://auth.openai.com',
          sub: 'person',
          aud: 'issued',
          exp: Date.now() / 1000 + 3600,
          nonce: params.get('nonce'),
        }),
      ).toString('base64url');
      const idToken =
        header +
        '.' +
        claims +
        '.' +
        sign(
          'RSA-SHA256',
          Buffer.from(header + '.' + claims),
          privateKey,
        ).toString('base64url');
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: PLAN_SCOPE + ' resource.invoke',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test' }],
          }),
        });
      const redirect = await connection.finish(
        {
          state: params.get('state')!,
          code: 'one-time-code',
          client_id: 'issued',
        },
        auth.binding,
      );
      expect(redirect).toBe(origin + '/notes/example?chatgpt=connected');
      expect(store.save).toHaveBeenCalledWith(
        'owner',
        expect.objectContaining({
          accessToken: 'new-access',
          subject: 'person',
        }),
      );
      const fields = (global.fetch as jest.Mock).mock.calls[0][1]
        .body as URLSearchParams;
      expect(fields.get('code')).toBe('one-time-code');
      expect(fields.get('client_id')).toBe('issued');
      expect(fields.get('code_verifier')).toBeTruthy();
      expect(fields.get('redirect_uri')).toBe(
        `http://127.0.0.1:${port}/chatgpt/callback`,
      );
      expect(fields.has('client_secret')).toBe(false);
      await expect(
        connection.finish(
          { state: params.get('state')!, code: 'replay' },
          auth.binding,
        ),
      ).rejects.toThrow();
    },
  );
  it('serializes concurrent refresh calls and saves rotation once', async () => {
    const { connection, store } = setup();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });
    const result = await Promise.all([
      connection.credential('owner'),
      connection.credential('owner'),
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(result[0].refreshToken).toBe('new-refresh');
  });
  it('disconnect prevents an in-flight refresh from resurrecting credentials', async () => {
    const { connection, store } = setup();
    let release!: (value: unknown) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => {
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      })
      .mockResolvedValue({ ok: true });
    const refresh = connection.credential('owner');
    const rejected = expect(refresh).rejects.toThrow();
    await ready;
    const disconnect = connection.disconnect('owner');
    release({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });
    await rejected;
    await disconnect;
    expect((await store.read()).accessToken).toBe('');
    await expect(connection.credential('owner')).rejects.toThrow();
  });
  it('disconnect invalidates outstanding authorization attempts', async () => {
    const { connection } = setup();
    const start = await connection.begin('owner');
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await connection.disconnect('owner');
    await expect(
      connection.authorize(new URL(start.url).searchParams.get('ticket')!),
    ).rejects.toThrow();
  });
});

describe('hosted ChatGPT loopback configuration', () => {
  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      WEB_ORIGIN: 'https://app.interviewbase.site',
      CHATGPT_REDIRECT_URI: 'http://127.0.0.1:4000/chatgpt/callback',
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('advertises forwarding to the hosted UI without exposing credentials', async () => {
    const { connection } = setup();
    const status = await connection.status('owner');
    expect(status).toMatchObject({
      connectionMode: 'forwarded',
      callbackPort: 4000,
    });
    expect(JSON.stringify(status)).not.toContain('old-refresh');
  });

  it.each([0, -1, 1023, 65536, 1.5, NaN])(
    'rejects invalid forwarded port %s',
    async (port) => {
      const { connection } = setup();
      await expect(
        Reflect.apply(connection.begin, connection, ['owner', '/', port]),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    },
  );

  it.each([
    'http://app.interviewbase.site',
    'https://user:pass@app.interviewbase.site',
  ])('rejects an unsafe hosted web origin %s', async (origin) => {
    process.env.WEB_ORIGIN = origin;
    await expect(setup().connection.begin('owner')).rejects.toThrow();
  });

  it.each([
    'https://api.interviewbase.site/chatgpt/callback',
    'http://localhost:4000/chatgpt/callback',
    'http://127.0.0.1:4000/wrong',
    'http://127.0.0.1:4000/chatgpt/callback?x=1',
  ])('rejects a non-loopback or malformed callback %s', async (uri) => {
    process.env.CHATGPT_REDIRECT_URI = uri;
    await expect(setup().connection.begin('owner')).rejects.toThrow();
  });

  it('does not accept an external return URL on hosted connections', async () => {
    const { connection } = setup();
    const start = await connection.begin('owner', '//evil.test');
    const auth = await connection.authorize(
      new URL(start.url).searchParams.get('ticket')!,
    );
    const state = new URL(auth.url).searchParams.get('state')!;
    expect(
      await connection.finish({ state, error: 'access_denied' }, auth.binding),
    ).toBe('https://app.interviewbase.site/?chatgpt=error');
  });
});
