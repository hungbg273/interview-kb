import 'reflect-metadata';
import '../load-env';
import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createDataSource } from './typeorm.config';
import { NoteTagsRepository } from './note-tags.repository';
import { NotesRepository } from './notes.repository';
import { QuestionsRepository } from './questions.repository';
import { TagsRepository } from './tags.repository';
import { TopicsRepository } from './topics.repository';

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
    TopicsRepository,
    TagsRepository,
    NotesRepository,
    NoteTagsRepository,
    QuestionsRepository,
  ],
  exports: [
    DataSource,
    TopicsRepository,
    TagsRepository,
    NotesRepository,
    NoteTagsRepository,
    QuestionsRepository,
  ],
})
export class DatabaseModule {}
