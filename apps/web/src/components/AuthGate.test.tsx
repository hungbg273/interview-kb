import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/',
}));

import { AuthGate } from './AuthGate';

afterEach(() => {
  cleanup();
  replace.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body?: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: 'Error',
    json: async () => body,
  };
}

describe('AuthGate', () => {
  it('redirects unauthenticated visitors to login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: 'UNAUTHENTICATED', message: 'missing token' },
        }),
      ),
    );

    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children and the user email when the session is valid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { email: 'you@example.com' })),
    );

    render(
      <AuthGate>
        <p>Danh sách sẽ có ở bước 11.</p>
      </AuthGate>,
    );

    expect(await screen.findByText('you@example.com')).toBeInTheDocument();
    expect(screen.getByText('Danh sách sẽ có ở bước 11.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ghi chú' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Luyện tập' })).toHaveAttribute('href', '/practice');
    expect(screen.queryByRole('link', { name: 'Chủ đề' })).not.toBeInTheDocument();
  });

  it('logs out then returns to login', async () => {
    const noContent = {
      status: 204,
      ok: true,
      json: async () => {
        throw new Error('no body');
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(noContent)
      .mockResolvedValueOnce(jsonResponse(200, { email: 'you@example.com' }))
      .mockResolvedValueOnce(noContent);
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthGate>
        <p>secret</p>
      </AuthGate>,
    );

    await screen.findByText('you@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        'http://localhost:4000/auth/logout',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
