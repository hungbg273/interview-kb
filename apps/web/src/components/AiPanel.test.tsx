import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { AiPanel } from './AiPanel';

test('shows retry on error', () => {
  render(
    <AiPanel
      error="AI request timed out"
      preview=""
      provider="openai"
      lastAction="summarize"
      onProviderChange={() => {}}
      onRun={() => {}}
      onApply={() => {}}
      onDiscard={() => {}}
    />,
  );
  expect(screen.getByText('AI request timed out')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
});
