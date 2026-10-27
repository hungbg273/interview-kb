import { generateKeyPairSync, sign } from 'node:crypto';
import { ISSUER, validateIdentity } from './chatgpt.identity';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
function token(extra: Record<string, unknown> = {}) {
  const head = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'test' }),
  ).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      iss: ISSUER,
      sub: 'person',
      aud: 'issued-client',
      exp: Date.now() / 1000 + 3600,
      nonce: 'nonce',
      ...extra,
    }),
  ).toString('base64url');
  return (
    head +
    '.' +
    body +
    '.' +
    sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString(
      'base64url',
    )
  );
}
describe('ChatGPT ID token validation', () => {
  const original = global.fetch;
  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test' }],
        }),
      });
  });
  afterEach(() => {
    global.fetch = original;
  });
  it('verifies signed identity and nonce', async () => {
    await expect(
      validateIdentity(token(), 'issued-client', 'nonce'),
    ).resolves.toMatchObject({ subject: 'person' });
  });
  it.each([
    { nonce: 'wrong' },
    { aud: 'other' },
    { exp: 0 },
    { aud: ['issued-client', 'other'] },
    { aud: ['issued-client', 'other'], azp: 'other' },
    { azp: 'other' },
    { iss: 'https://other.test' },
  ])('rejects invalid claims %j', async (extra) => {
    await expect(
      validateIdentity(token(extra), 'issued-client', 'nonce'),
    ).rejects.toMatchObject({ code: 'CHATGPT_RECONNECT_REQUIRED' });
  });
  it('requires authorized party with multiple audiences', async () => {
    await expect(
      validateIdentity(
        token({ aud: ['issued-client', 'other'], azp: 'issued-client' }),
        'issued-client',
        'nonce',
      ),
    ).resolves.toMatchObject({ subject: 'person' });
  });
});
