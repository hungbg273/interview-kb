import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api,
  API_URL: 'http://localhost:4000',
}));

import TopicsPage from './page';

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe('TopicsPage', () => {
  it('creates a topic then shows it in the list', async () => {
    const topics: { id: string; name: string; slug: string; parentId: string | null }[] = [];
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/topics' && !init) return [...topics];
      if (path === '/topics' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { name: string };
        topics.push({ id: '1', name: body.name, slug: 'react', parentId: null });
        return topics[0];
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<TopicsPage />);

    expect(await screen.findByText('Chưa có chủ đề')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Tên chủ đề'), {
      target: { value: 'React' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => {
      expect(screen.getByText('React')).toBeInTheDocument();
    });
  });
});
