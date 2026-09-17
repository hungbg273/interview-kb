import { getMetadataArgsStorage } from 'typeorm';
import { Note } from './note.entity';
import { NoteTag } from './note-tag.entity';
import { Question } from './question.entity';
import { Tag } from './tag.entity';
import { Topic } from './topic.entity';

function columnNames(target: Function) {
  return getMetadataArgsStorage()
    .columns.filter((c) => c.target === target)
    .map((c) => c.propertyName);
}

describe('TypeORM entities', () => {
  it('Topic has tree parent and unique slug, no userId', () => {
    const names = columnNames(Topic);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'parentId', 'createdAt']),
    );
    expect(names).not.toContain('userId');
    const slug = getMetadataArgsStorage().columns.find(
      (c) => c.target === Topic && c.propertyName === 'slug',
    );
    expect(slug?.options.unique).toBe(true);
  });

  it('Tag has unique name and slug', () => {
    const names = columnNames(Tag);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'createdAt']),
    );
    expect(
      getMetadataArgsStorage().columns.find(
        (c) => c.target === Tag && c.propertyName === 'name',
      )?.options.unique,
    ).toBe(true);
  });

  it('Note has title and bodyMarkdown and does not map searchVector', () => {
    const names = columnNames(Note);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'title', 'bodyMarkdown', 'topicId']),
    );
    expect(names).not.toContain('searchVector');
    expect(names).not.toContain('search_vector');
  });

  it('NoteTag is a composite join of note and tag', () => {
    const names = columnNames(NoteTag);
    expect(names).toEqual(expect.arrayContaining(['noteId', 'tagId']));
  });

  it('Question is ABCD with source enum', () => {
    const names = columnNames(Question);
    expect(names).toEqual(
      expect.arrayContaining([
        'prompt',
        'choiceA',
        'choiceB',
        'choiceC',
        'choiceD',
        'correctChoice',
        'explanationMarkdown',
        'source',
        'noteId',
      ]),
    );
  });

  it('deleting a note cascades questions and tag links', () => {
    const relations = getMetadataArgsStorage().relations;
    const questionNote = relations.find(
      (r) => r.target === Question && r.propertyName === 'note',
    );
    const noteTagNote = relations.find(
      (r) => r.target === NoteTag && r.propertyName === 'note',
    );
    expect(questionNote?.options?.onDelete).toBe('CASCADE');
    expect(noteTagNote?.options?.onDelete).toBe('CASCADE');
  });
});
