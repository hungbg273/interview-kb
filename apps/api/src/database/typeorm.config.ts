import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { Note } from '../entities/note.entity';
import { NoteTag } from '../entities/note-tag.entity';
import { Question } from '../entities/question.entity';
import { Tag } from '../entities/tag.entity';
import { Topic } from '../entities/topic.entity';
import { InitSchema1760000000001 } from '../migrations/1760000000001-InitSchema';
import { NoteFts1760000000002 } from '../migrations/1760000000002-NoteFts';

export const entities = [Topic, Tag, Note, NoteTag, Question];

export const migrations = [InitSchema1760000000001, NoteFts1760000000002];

export function typeormOptions(): DataSourceOptions {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  return {
    type: 'postgres',
    url,
    entities,
    migrations,
    synchronize: false,
    logging: false,
  };
}

export function createDataSource() {
  return new DataSource(typeormOptions());
}
