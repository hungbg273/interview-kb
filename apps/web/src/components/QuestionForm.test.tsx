import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { QuestionForm } from './QuestionForm';

test('has A-D radios', () => {
  render(
    <QuestionForm
      value={{
        prompt: '',
        choiceA: '',
        choiceB: '',
        choiceC: '',
        choiceD: '',
        correctChoice: 'A',
        explanationMarkdown: '',
        lang: 'vi',
      }}
      onChange={() => {}}
      onSubmit={() => {}}
    />,
  );
  expect(screen.getByLabelText('Câu hỏi')).toBeTruthy();
  expect(screen.getByLabelText('Giải thích (tuỳ chọn)')).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Các đáp án' })).toBeTruthy();
  expect(screen.getByLabelText('A')).toBeTruthy();
  expect(screen.getByLabelText('D')).toBeTruthy();
});
