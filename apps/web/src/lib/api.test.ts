import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, API_URL } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: 'Error',
    json: async () => body,
  };
}

describe('api', () => {
  it('sends credentials and JSON content-type to the API origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api('/auth/me');

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/auth/me`,
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('throws ApiError from the API error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: 'UNAUTHENTICATED', message: 'missing token' },
        }),
      ),
    );

    const err = await api('/auth/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'missing token',
    });
  });

  it('returns undefined for 204 responses without reading JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 204,
        ok: true,
        json: async () => {
          throw new Error('no body');
        },
      }),
    );

    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
