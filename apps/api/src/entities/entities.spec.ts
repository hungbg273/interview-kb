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

function dbColumnNames(target: Function) {
  return getMetadataArgsStorage()
    .columns.filter((c) => c.target === target)
    .map((c) => (c.options.name as string | undefined) ?? c.propertyName);
}

function joinColumnNames(target: Function) {
  return getMetadataArgsStorage()
    .joinColumns.filter((c) => c.target === target)
    .map((c) => c.name)
    .filter((name): name is string => Boolean(name));
}

function relationIdNames(target: Function) {
  return getMetadataArgsStorage()
    .relationIds.filter((c) => c.target === target)
    .map((c) => c.propertyName);
}

describe('TypeORM entities', () => {
  it('Topic has tree parent and unique slug, no userId', () => {
    const names = columnNames(Topic);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'createdAt']),
    );
    expect(names).not.toContain('userId');
    expect(names).not.toContain('parentId');
    expect(relationIdNames(Topic)).toContain('parentId');
    expect(joinColumnNames(Topic)).toContain('parent_id');
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
      expect.arrayContaining(['id', 'title', 'bodyMarkdown']),
    );
    expect(names).not.toContain('topicId');
    expect(names).not.toContain('searchVector');
    expect(names).not.toContain('search_vector');
    expect(relationIdNames(Note)).toContain('topicId');
    expect(joinColumnNames(Note)).toContain('topic_id');
    const check = getMetadataArgsStorage().checks.find((c) => c.target === Note);
    expect(check?.expression).toMatch(/char_length\(body_markdown\) <= 100000/);
  });

  it('NoteTag is a composite join of note and tag', () => {
    const names = columnNames(NoteTag);
    expect(names).toEqual(expect.arrayContaining(['noteId', 'tagId']));
    expect(joinColumnNames(NoteTag)).toEqual(
      expect.arrayContaining(['note_id', 'tag_id']),
    );
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
      ]),
    );
    expect(names).not.toContain('noteId');
    expect(relationIdNames(Question)).toContain('noteId');
    const correct = getMetadataArgsStorage().columns.find(
      (c) => c.target === Question && c.propertyName === 'correctChoice',
    );
    const source = getMetadataArgsStorage().columns.find(
      (c) => c.target === Question && c.propertyName === 'source',
    );
    expect(correct?.options.enumName).toBe('question_correct_choice');
    expect(source?.options.enumName).toBe('question_source');
  });

  it('does not map the same FK column twice on Topic, Note, or Question', () => {
    for (const target of [Topic, Note, Question]) {
      const overlap = dbColumnNames(target).filter((name) =>
        joinColumnNames(target).includes(name),
      );
      expect(overlap).toEqual([]);
    }
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
