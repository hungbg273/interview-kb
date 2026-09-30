import { getMetadataArgsStorage } from 'typeorm';
import { Note } from './note.entity';
import { NoteTopic } from './note-topic.entity';
import { Question } from './question.entity';
import { Topic } from './topic.entity';
import { TopicParent } from './topic-parent.entity';

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
  it('Topic has unique slug and no single parent column', () => {
    const names = columnNames(Topic);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'name', 'slug', 'createdAt']),
    );
    expect(names).not.toContain('userId');
    expect(names).not.toContain('parentId');
    expect(relationIdNames(Topic)).not.toContain('parentId');
    expect(joinColumnNames(Topic)).not.toContain('parent_id');
    const slug = getMetadataArgsStorage().columns.find(
      (c) => c.target === Topic && c.propertyName === 'slug',
    );
    expect(slug?.options.unique).toBe(true);
  });

  it('TopicParent is a composite parent-child edge', () => {
    const names = columnNames(TopicParent);
    expect(names).toEqual(expect.arrayContaining(['parentId', 'childId']));
    expect(joinColumnNames(TopicParent)).toEqual(
      expect.arrayContaining(['parent_id', 'child_id']),
    );
  });

  it('Note has title and bodyMarkdown and no topic_id column', () => {
    const names = columnNames(Note);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'title', 'bodyMarkdown']),
    );
    expect(names).not.toContain('topicId');
    expect(names).not.toContain('searchVector');
    expect(joinColumnNames(Note)).not.toContain('topic_id');
    const check = getMetadataArgsStorage().checks.find((c) => c.target === Note);
    expect(check?.expression).toMatch(/char_length\(body_markdown\) <= 100000/);
  });

  it('NoteTopic is a composite join of note and topic', () => {
    const names = columnNames(NoteTopic);
    expect(names).toEqual(expect.arrayContaining(['noteId', 'topicId']));
    expect(joinColumnNames(NoteTopic)).toEqual(
      expect.arrayContaining(['note_id', 'topic_id']),
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
        'lang',
        'source',
      ]),
    );
    expect(relationIdNames(Question)).toContain('noteId');
    const correct = getMetadataArgsStorage().columns.find(
      (c) => c.target === Question && c.propertyName === 'correctChoice',
    );
    const source = getMetadataArgsStorage().columns.find(
      (c) => c.target === Question && c.propertyName === 'source',
    );
    expect(correct?.options.enumName).toBe('question_correct_choice');
    const lang = getMetadataArgsStorage().columns.find(
      (c) => c.target === Question && c.propertyName === 'lang',
    );
    expect(source?.options.enumName).toBe('question_source');
    expect(lang?.options.enumName).toBe('question_lang');
  });

  it('does not map the same FK column twice on Topic, Note, or Question', () => {
    for (const target of [Topic, Note, Question]) {
      const overlap = dbColumnNames(target).filter((name) =>
        joinColumnNames(target).includes(name),
      );
      expect(overlap).toEqual([]);
    }
  });

  it('deleting a note cascades questions and topic links', () => {
    const relations = getMetadataArgsStorage().relations;
    const questionNote = relations.find(
      (r) => r.target === Question && r.propertyName === 'note',
    );
    const noteTopicNote = relations.find(
      (r) => r.target === NoteTopic && r.propertyName === 'note',
    );
    expect(questionNote?.options?.onDelete).toBe('CASCADE');
    expect(noteTopicNote?.options?.onDelete).toBe('CASCADE');
  });
});
