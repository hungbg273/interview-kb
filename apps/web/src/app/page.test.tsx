import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-gate">{children}</div>
  ),
}));

const { api } = vi.hoisted(() => ({
  api: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api,
  API_URL: 'http://localhost:4000',
}));

import HomePage from './page';

afterEach(() => {
  cleanup();
  push.mockReset();
  api.mockReset();
});

describe('HomePage explorer', () => {
  it('shows roots, uncategorized, expands children, and panel actions', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/topics') return [{ id: 'net', name: 'Networking' }];
      if (path === '/topics?parentId=net') return [{ id: 'tcp', name: 'TCP' }];
      if (path.startsWith('/notes?uncategorized')) return { items: [] };
      if (path.startsWith('/notes?topicId=net')) {
        return { items: [{ id: 'n1', title: 'OSI vs TCP/IP' }] };
      }
      if (path.startsWith('/notes')) return { items: [] };
      throw new Error(`unexpected ${path}`);
    });

    render(<HomePage />);

    expect(await screen.findByRole('button', { name: 'Chưa gán chủ đề' })).toBeInTheDocument();
    expect(screen.getByText('Networking')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Networking' }));

    expect(await screen.findByText('TCP')).toBeInTheDocument();
    expect(await screen.findByText('OSI vs TCP/IP')).toBeInTheDocument();

    expect(await screen.findByRole('button', { name: 'Thêm chủ đề con' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gắn ghi chú' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm cha' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Chọn / xem ghi chú' }),
    ).not.toBeInTheDocument();
  });

  it('deletes a note from the panel', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let gone = false;
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/topics') return [{ id: 'net', name: 'Networking' }];
      if (path === '/topics?parentId=net') return [];
      if (path.startsWith('/notes?uncategorized')) return { items: [] };
      if (path === '/notes/n1' && init?.method === 'DELETE') {
        gone = true;
        return undefined;
      }
      if (path.startsWith('/notes?topicId=net')) {
        return { items: gone ? [] : [{ id: 'n1', title: 'OSI vs TCP/IP' }] };
      }
      if (path.startsWith('/notes')) return { items: [] };
      throw new Error(`unexpected ${path}`);
    });

    render(<HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Networking' }));
    expect(await screen.findByText('OSI vs TCP/IP')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa OSI vs TCP/IP' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/notes/n1', { method: 'DELETE' });
    });
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText('OSI vs TCP/IP')).not.toBeInTheDocument();
    });
    confirm.mockRestore();
  });

  it('search keeps only matching graph nodes and lists notes', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/topics') return [{ id: 'net', name: 'Networking' }];
      if (path.startsWith('/notes?uncategorized')) return { items: [] };
      if (path.startsWith('/search?q=TCP')) {
        return {
          topics: [{ id: 'tcp', name: 'TCP' }],
          notes: [{ id: 'n1', title: 'TCP handshake' }],
        };
      }
      if (path === '/topics?parentId=tcp') return [];
      if (path.startsWith('/notes?topicId=tcp')) return { items: [] };
      if (path.startsWith('/notes')) return { items: [] };
      throw new Error(`unexpected ${path}`);
    });

    render(<HomePage />);
    expect(await screen.findByRole('button', { name: 'Networking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chưa gán chủ đề' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Tìm chủ đề hoặc tiêu đề ghi chú'), {
      target: { value: 'TCP' },
    });

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/search?q=TCP');
    });
    expect(await screen.findByRole('button', { name: 'TCP' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Networking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chưa gán chủ đề' })).not.toBeInTheDocument();
    expect(screen.getByText('Ghi chú')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TCP handshake' })).toHaveAttribute(
      'href',
      '/notes/n1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'TCP' }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'TCP handshake' })).not.toBeInTheDocument();
    });
  });
});
