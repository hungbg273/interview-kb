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
      }}
      onChange={() => {}}
      onSubmit={() => {}}
    />,
  );
  expect(screen.getByLabelText('A')).toBeTruthy();
  expect(screen.getByLabelText('D')).toBeTruthy();
});
