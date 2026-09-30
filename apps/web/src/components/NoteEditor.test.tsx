import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { NoteEditor } from './NoteEditor';

afterEach(() => {
  cleanup();
});

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

test('shows subject chips under the title', () => {
  render(
    <NoteEditor
      title="T"
      bodyMarkdown=""
      onTitleChange={() => {}}
      onBodyChange={() => {}}
      onSave={() => {}}
      topics={[{ id: 'tcp', name: 'TCP' }]}
      topicQuery=""
      topicHits={[]}
      onTopicQueryChange={() => {}}
      onAddTopic={() => {}}
      onRemoveTopic={() => {}}
    />,
  );
  expect(screen.getByText('TCP')).toBeTruthy();
  expect(screen.getByPlaceholderText('+ Chủ đề')).toBeTruthy();
});

test('shows a popup after a successful save', async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <NoteEditor
      title="T"
      bodyMarkdown=""
      onTitleChange={() => {}}
      onBodyChange={() => {}}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
  expect(await screen.findByRole('dialog', { name: 'Đã lưu' })).toBeInTheDocument();
});
