import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-gate">{children}</div>
  ),
}));

const { api } = vi.hoisted(() => ({ api: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api,
  API_URL: 'http://localhost:4000',
}));

import PracticePage from './page';

afterEach(() => {
  cleanup();
  api.mockReset();
});

describe('PracticePage', () => {
  it('starts a quiz from a note and cannot continue without a choice', async () => {
    api.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path.startsWith('/search?q=')) {
        return { topics: [], notes: [{ id: 'n1', title: 'TCP handshake' }] };
      }
      if (path.startsWith('/practice/questions')) {
        return {
          items: [
            {
              id: 'q1',
              prompt: 'SYN first?',
              choiceA: 'yes',
              choiceB: 'no',
              choiceC: 'maybe',
              choiceD: 'never',
            },
            {
              id: 'q2',
              prompt: 'ACK last?',
              choiceA: 'yes',
              choiceB: 'no',
              choiceC: 'maybe',
              choiceD: 'never',
            },
          ],
        };
      }
      if (path === '/practice/grade' && init?.method === 'POST') {
        return {
          total: 2,
          correct: 1,
          items: [
            {
              questionId: 'q1',
              prompt: 'SYN first?',
              choice: 'A',
              correctChoice: 'A',
              ok: true,
              explanationMarkdown: 'yes',
            },
            {
              questionId: 'q2',
              prompt: 'ACK last?',
              choice: 'B',
              correctChoice: 'A',
              ok: false,
              explanationMarkdown: null,
            },
          ],
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<PracticePage />);

    fireEvent.change(screen.getByPlaceholderText('Tìm ghi chú hoặc chủ đề'), {
      target: { value: 'TCP' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'TCP handshake' }));
    expect(screen.queryByRole('button', { name: 'TCP handshake' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ghi chú: TCP handshake/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Ngôn ngữ'), { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));

    expect(await screen.findByText('Câu 1 / 2')).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith(
      expect.stringContaining('/practice/questions?noteId=n1&limit=10&lang=en'),
    );

    expect(await screen.findByText('Câu 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('SYN first?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Câu tiếp' })).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/A\./));
    fireEvent.click(screen.getByRole('button', { name: 'Câu tiếp' }));

    expect(await screen.findByText('Câu 2 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/B\./));
    fireEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));

    expect(await screen.findByText('Đúng 1 / 2')).toBeInTheDocument();
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/practice/grade',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  it('reviews CV-generated questions without showing answers before the quiz', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/practice/imports') {
        return {
          draftId: 'd1',
          items: [
            {
              id: 'q1',
              prompt: 'From CV: SYN first?',
              choiceA: 'yes',
              choiceB: 'no',
              choiceC: 'maybe',
              choiceD: 'never',
              suggestedTopics: ['TCP'],
            },
          ],
        };
      }
      if (path.startsWith('/search?q=')) {
        return { topics: [{ id: 't1', name: 'TCP' }], notes: [{ id: 'n1', title: 'TCP handshake' }] };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<PracticePage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Từ CV/ }));
    expect(screen.getByPlaceholderText('Tìm ghi chú hoặc chủ đề')).toBeInTheDocument();
    expect(screen.getByLabelText('Cấp')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sinh câu hỏi' }));

    expect(await screen.findByText('From CV: SYN first?')).toBeInTheDocument();
    expect(screen.queryByText(/đúng:/i)).toBeNull();
    expect(api).toHaveBeenCalledWith(
      '/practice/imports',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('starts a quiz from mixed notes and topics', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/search?q=')) {
        return {
          topics: [{ id: 't1', name: 'TCP' }],
          notes: [
            { id: 'n1', title: 'TCP handshake' },
            { id: 'n2', title: 'TLS notes' },
          ],
        };
      }
      if (path.startsWith('/practice/questions')) {
        return {
          items: [
            {
              id: 'q1',
              prompt: 'SYN first?',
              choiceA: 'yes',
              choiceB: 'no',
              choiceC: 'maybe',
              choiceD: 'never',
            },
          ],
        };
      }
      throw new Error(`unexpected ${path}`);
    });

    render(<PracticePage />);

    const search = screen.getByPlaceholderText('Tìm ghi chú hoặc chủ đề');
    fireEvent.change(search, { target: { value: 'TCP' } });
    fireEvent.click(await screen.findByRole('button', { name: 'TCP handshake' }));
    fireEvent.change(search, { target: { value: 'TCP' } });
    fireEvent.click(await screen.findByRole('button', { name: 'TLS notes' }));
    fireEvent.change(search, { target: { value: 'TCP' } });
    fireEvent.click(await screen.findByRole('button', { name: 'TCP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));

    expect(await screen.findByText('Câu 1 / 1')).toBeInTheDocument();
    const call = api.mock.calls.find(
      ([path]) => typeof path === 'string' && path.startsWith('/practice/questions'),
    );
    expect(call?.[0]).toContain('noteId=n1');
    expect(call?.[0]).toContain('noteId=n2');
    expect(call?.[0]).toContain('topicId=t1');
  });
});
