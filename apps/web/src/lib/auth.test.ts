import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMe } from './auth';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getMe', () => {
  it('returns null when the session is unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        statusText: 'Unauthorized',
        json: async () => ({
          error: { code: 'UNAUTHENTICATED', message: 'missing token' },
        }),
      }),
    );

    await expect(getMe()).resolves.toBeNull();
  });

  it('returns the current user email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ email: 'you@example.com' }),
      }),
    );

    await expect(getMe()).resolves.toEqual({ email: 'you@example.com' });
  });

  it('rethrows non-401 API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 500,
        ok: false,
        statusText: 'Server Error',
        json: async () => ({ error: { code: 'ERROR', message: 'boom' } }),
      }),
    );

    await expect(getMe()).rejects.toMatchObject({ status: 500, message: 'boom' });
  });
});
