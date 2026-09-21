import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { NotesModule } from './notes/notes.module';
import { QuestionsModule } from './questions/questions.module';
import { TagsModule } from './tags/tags.module';
import { TopicsModule } from './topics/topics.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TopicsModule,
    TagsModule,
    NotesModule,
    QuestionsModule,
    AiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
