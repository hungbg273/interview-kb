import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-gate">{children}</div>
  ),
}));

import HomePage from './page';

afterEach(cleanup);

describe('HomePage', () => {
  it('wraps the placeholder note list in AuthGate', () => {
    render(<HomePage />);

    expect(screen.getByTestId('auth-gate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ghi chú' })).toBeInTheDocument();
    expect(screen.getByText('Danh sách sẽ có ở bước 11.')).toBeInTheDocument();
  });
});
