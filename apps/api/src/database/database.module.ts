import 'reflect-metadata';
import '../load-env';
import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createDataSource } from './typeorm.config';
import { NoteTopicsRepository } from './note-topics.repository';
import { NotesRepository } from './notes.repository';
import { QuestionsRepository } from './questions.repository';
import { TopicParentsRepository } from './topic-parents.repository';
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
    TopicParentsRepository,
    NotesRepository,
    NoteTopicsRepository,
    QuestionsRepository,
  ],
  exports: [
    DataSource,
    TopicsRepository,
    TopicParentsRepository,
    NotesRepository,
    NoteTopicsRepository,
    QuestionsRepository,
  ],
})
export class DatabaseModule {}
