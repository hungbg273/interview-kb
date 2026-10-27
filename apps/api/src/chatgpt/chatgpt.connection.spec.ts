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
  it('exchanges the code with PKCE and verifies identity before saving the owner connection', async () => {
    const { connection, store } = setup();
    const start = await connection.begin('owner', '/notes/example');
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
    expect(redirect).toBe(
      'http://localhost:3000/notes/example?chatgpt=connected',
    );
    expect(store.save).toHaveBeenCalledWith(
      'owner',
      expect.objectContaining({ accessToken: 'new-access', subject: 'person' }),
    );
    const fields = (global.fetch as jest.Mock).mock.calls[0][1]
      .body as URLSearchParams;
    expect(fields.get('code')).toBe('one-time-code');
    expect(fields.get('client_id')).toBe('issued');
    expect(fields.get('code_verifier')).toBeTruthy();
    expect(fields.has('client_secret')).toBe(false);
  });
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
