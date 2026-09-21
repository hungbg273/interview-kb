import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { searchParams } = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

import LoginPage from './page';

afterEach(() => {
  cleanup();
  searchParams.delete('error');
});

describe('LoginPage', () => {
  it('links the Google button to the API OAuth start URL', () => {
    render(<LoginPage />);

    expect(screen.getByRole('button', { name: 'Đăng nhập bằng Google' })).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'http://localhost:4000/auth/google',
    );
    expect(
      screen.queryByText('Email Google không nằm trong whitelist.'),
    ).not.toBeInTheDocument();
  });

  it('shows the whitelist error when Google rejects the email', () => {
    searchParams.set('error', 'forbidden');
    render(<LoginPage />);

    expect(
      screen.getByText('Email Google không nằm trong whitelist.'),
    ).toBeInTheDocument();
  });
});
