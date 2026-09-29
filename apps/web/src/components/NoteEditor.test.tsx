import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { NoteEditor } from './NoteEditor';

test('Save button is present', () => {
  render(
    <NoteEditor
      title="T"
      bodyMarkdown="# hi"
      onTitleChange={() => {}}
      onBodyChange={() => {}}
      onSave={() => {}}
      error=""
    />,
  );
  expect(screen.getByRole('button', { name: 'Lưu' })).toBeTruthy();
  expect(screen.getByPlaceholderText('Viết tự do. Không cần Markdown.')).toBeTruthy();
});
