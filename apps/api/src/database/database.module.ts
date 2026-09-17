import 'reflect-metadata';
import '../load-env';
import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Note } from '../entities/note.entity';
import { NoteTag } from '../entities/note-tag.entity';
import { Question } from '../entities/question.entity';
import { Tag } from '../entities/tag.entity';
import { Topic } from '../entities/topic.entity';
import { createDataSource } from './typeorm.config';

export const TOPIC_REPOSITORY = 'TOPIC_REPOSITORY';
export const TAG_REPOSITORY = 'TAG_REPOSITORY';
export const NOTE_REPOSITORY = 'NOTE_REPOSITORY';
export const NOTE_TAG_REPOSITORY = 'NOTE_TAG_REPOSITORY';
export const QUESTION_REPOSITORY = 'QUESTION_REPOSITORY';

@Injectable()
class DataSourceLifecycle implements OnModuleDestroy {
  constructor(@Inject(DataSource) private readonly dataSource: DataSource) {}

  async onModuleDestroy() {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      useFactory: async () => {
        const dataSource = createDataSource();
        await dataSource.initialize();
        return dataSource;
      },
    },
    DataSourceLifecycle,
    {
      provide: TOPIC_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => dataSource.getRepository(Topic),
    },
    {
      provide: TAG_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => dataSource.getRepository(Tag),
    },
    {
      provide: NOTE_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => dataSource.getRepository(Note),
    },
    {
      provide: NOTE_TAG_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => dataSource.getRepository(NoteTag),
    },
    {
      provide: QUESTION_REPOSITORY,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => dataSource.getRepository(Question),
    },
  ],
  exports: [
    DataSource,
    TOPIC_REPOSITORY,
    TAG_REPOSITORY,
    NOTE_REPOSITORY,
    NOTE_TAG_REPOSITORY,
    QUESTION_REPOSITORY,
  ],
})
export class DatabaseModule {}
