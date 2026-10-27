import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

    expect(await screen.findByRole('button', { name: 'Mở ghi chú chưa gán chủ đề' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở chủ đề Networking' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở chủ đề Networking' }));

    expect(await screen.findByRole('button', { name: 'Mở chủ đề TCP' })).toBeInTheDocument();
    expect(await screen.findByText('OSI vs TCP/IP')).toBeInTheDocument();

    expect(await screen.findByRole('button', { name: 'Thêm chủ đề con' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gắn ghi chú' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm cha' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Chọn / xem ghi chú' }),
    ).not.toBeInTheDocument();
  });

  it('collapses the topic sidebar and navigates through its tree', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/topics') return [{ id: 'net', name: 'Networking' }];
      if (path === '/topics?parentId=net') return [];
      return { items: [] };
    });
    render(<HomePage />);
    const tree = await screen.findByRole('navigation', { name: 'Cây chủ đề' });
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn cây chủ đề' }));
    expect(tree).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Hiện cây chủ đề' }));
    expect(tree).toBeVisible();
    fireEvent.click(await screen.findByRole('button', { name: 'Mở chủ đề Networking' }));
    expect(await screen.findByRole('button', { name: 'Thêm chủ đề con' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ẩn thông tin chủ đề' }));
    expect(screen.queryByRole('button', { name: 'Thêm chủ đề con' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hiện thông tin chủ đề' }));
    expect(screen.getByRole('button', { name: 'Thêm chủ đề con' })).toBeVisible();
  });

  it('shows note content in the center and only the selected topic and children in the right graph', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/topics') return [{id:'net',name:'Networking'},{id:'other',name:'Other'}];
      if (path === '/topics?parentId=net') return [{id:'tcp',name:'TCP'}];
      if (path === '/topics?parentId=tcp') return [];
      if (path === '/notes?topicId=net') return {items:[{id:'n1',title:'OSI vs TCP/IP',bodyMarkdown:'## Transport layer\nReliable delivery.'}]};
      return {items:[]};
    });
    render(<HomePage />);
    fireEvent.click(await screen.findByRole('button', {name:'Mở chủ đề Networking'}));
    const content = screen.getByRole('region', {name:'Nội dung chủ đề'});
    expect(await within(content).findByText('Reliable delivery.')).toBeInTheDocument();
    const graph = screen.getByRole('region', {name:'Đồ thị cục bộ'});
    expect(await within(graph).findByRole('button', {name:'TCP'})).toBeInTheDocument();
    expect(within(graph).getByRole('button', {name:'Networking'})).toBeInTheDocument();
    expect(within(graph).queryByRole('button', {name:'Other'})).not.toBeInTheDocument();
    fireEvent.click(within(graph).getByRole('button', {name:'TCP'}));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/notes?topicId=tcp'));
    expect(within(content).queryByText('Reliable delivery.')).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: 'Mở chủ đề Networking' }));
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

  it('search filters the topic tree and lists notes', async () => {
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
    expect(await screen.findByRole('button', { name: 'Mở chủ đề Networking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở ghi chú chưa gán chủ đề' })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Tìm chủ đề hoặc tiêu đề ghi chú'), {
      target: { value: 'TCP' },
    });

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/search?q=TCP');
    });
    expect(await screen.findByRole('button', { name: 'Mở chủ đề TCP' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mở chủ đề Networking' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TCP handshake' })).toHaveAttribute(
      'href',
      '/notes/n1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mở chủ đề TCP' }));
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'TCP handshake' })).not.toBeInTheDocument();
    });
  });
});
