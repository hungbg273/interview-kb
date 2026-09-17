import { DataSource } from 'typeorm';
import { Note } from '../entities/note.entity';
import { NoteTag } from '../entities/note-tag.entity';
import { Question } from '../entities/question.entity';
import { Tag } from '../entities/tag.entity';
import { Topic } from '../entities/topic.entity';
import { createDataSource, entities, typeormOptions } from './typeorm.config';

describe('typeorm config', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalUrl;
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => typeormOptions()).toThrow('DATABASE_URL is not set');
  });

  it('keeps synchronize off and registers knowledge-base entities', () => {
    process.env.DATABASE_URL = 'postgresql://kb:kb@localhost:5432/kb';
    const options = typeormOptions();
    expect(options.synchronize).toBe(false);
    expect(options.type).toBe('postgres');
    expect(options.entities).toEqual(
      expect.arrayContaining([Topic, Tag, Note, NoteTag, Question]),
    );
    expect(entities).toHaveLength(5);
    expect(createDataSource()).toBeInstanceOf(DataSource);
  });
});
