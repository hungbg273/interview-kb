import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { NotesModule } from './notes/notes.module';
import { PracticeModule } from './practice/practice.module';
import { QuestionsModule } from './questions/questions.module';
import { SearchModule } from './search/search.module';
import { TopicsModule } from './topics/topics.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TopicsModule,
    NotesModule,
    QuestionsModule,
    PracticeModule,
    AiModule,
    SearchModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
