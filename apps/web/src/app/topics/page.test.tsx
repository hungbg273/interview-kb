import { describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirect(...args),
}));

import TopicsPage from './page';

describe('TopicsPage', () => {
  it('redirects to the graph explorer', () => {
    TopicsPage();
    expect(redirect).toHaveBeenCalledWith('/');
  });
});
