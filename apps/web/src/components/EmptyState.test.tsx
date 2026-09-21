import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { EmptyState } from './EmptyState';

test('shows CTA', () => {
  render(
    <EmptyState message="Chưa có ghi chú" actionLabel="Tạo ghi chú" onAction={() => {}} />,
  );
  expect(screen.getByText('Chưa có ghi chú')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tạo ghi chú' })).toBeTruthy();
});
