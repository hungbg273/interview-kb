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

describe('HomePage', () => {
  it('shows empty state when there are no notes', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/topics') return [];
      if (path === '/tags') return [];
      if (path.startsWith('/notes')) return { items: [] };
      throw new Error(`unexpected ${path}`);
    });

    render(<HomePage />);

    expect(screen.getByTestId('auth-gate')).toBeInTheDocument();
    expect(await screen.findByText('Chưa có ghi chú')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Tạo ghi chú' })[0]);
    expect(push).toHaveBeenCalledWith('/notes/new');
  });

  it('lists notes and sends search filters', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/topics') return [{ id: 't1', name: 'React' }];
      if (path === '/tags') return [{ id: 'g1', name: 'hooks' }];
      if (path.startsWith('/notes')) return { items: [{ id: 'n1', title: 'useEffect' }] };
      throw new Error(`unexpected ${path}`);
    });

    render(<HomePage />);

    expect(await screen.findByRole('link', { name: 'useEffect' })).toHaveAttribute(
      'href',
      '/notes/n1',
    );

    fireEvent.change(screen.getByPlaceholderText('Tìm kiếm'), { target: { value: 'effect' } });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 't1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm' }));

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/notes?q=effect&topicId=t1');
    });
  });
});
