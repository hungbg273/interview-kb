import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { Note } from '../entities/note.entity';
import { NoteTopic } from '../entities/note-topic.entity';
import { Question } from '../entities/question.entity';
import { Topic } from '../entities/topic.entity';
import { TopicParent } from '../entities/topic-parent.entity';
import { InitSchema1760000000001 } from '../migrations/1760000000001-InitSchema';
import { NoteFts1760000000002 } from '../migrations/1760000000002-NoteFts';
import { NoteBodyLength1760000000003 } from '../migrations/1760000000003-NoteBodyLength';
import { SubjectGraph1760000000004 } from '../migrations/1760000000004-SubjectGraph';
import { QuestionLang1760000000005 } from '../migrations/1760000000005-QuestionLang';

export const entities = [Topic, TopicParent, Note, NoteTopic, Question];

export const migrations = [
  InitSchema1760000000001,
  NoteFts1760000000002,
  NoteBodyLength1760000000003,
  SubjectGraph1760000000004,
  QuestionLang1760000000005,
];

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
