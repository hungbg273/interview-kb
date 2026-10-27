import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatgptStore } from './chatgpt.store';

describe('ChatgptStore', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kb-chatgpt-'));
    process.env.CHATGPT_CREDENTIALS_DIR = dir;
    process.env.CHATGPT_TOKEN_SECRET = 'test-only-encryption-key';
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.CHATGPT_CREDENTIALS_DIR;
    delete process.env.CHATGPT_TOKEN_SECRET;
  });
  it('encrypts credentials and separates owners while preserving host identity', async () => {
    const store = new ChatgptStore();
    await store.save('one', {
      clientId: 'issued',
      subject: 'sub',
      email: 'one@example.com',
      accessToken: 'private-token',
      refreshToken: 'refresh',
      idToken: 'jwt',
      expiresAt: Date.now() + 3600000,
      scopes: ['chatgpt.tokens.use.direct'],
    });
    expect((await store.read('one'))?.accessToken).toBe('private-token');
    expect(await store.read('two')).toBeNull();
    expect(await readFile(store.pathFor('one'), 'utf8')).not.toContain(
      'private-token',
    );
    expect(await new ChatgptStore().hostId()).toBe(await store.hostId());
  });
});
