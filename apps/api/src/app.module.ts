import { InterviewsModule } from './interviews/interviews.module';
import { CommunityModule } from './community/community.module';
import { AiJobsModule } from './ai-jobs/ai-jobs.module';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { AppErrorFilter } from './common/app-error.filter';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { NotesModule } from './notes/notes.module';
import { PracticeModule } from './practice/practice.module';
import { QuestionsModule } from './questions/questions.module';
import { SearchModule } from './search/search.module';
import { TopicsModule } from './topics/topics.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // Emit the log level as a word ("info"/"error") instead of a number so
        // Grafana/Loki `| json` queries can filter on it directly.
        formatters: { level: (label) => ({ level: label }) },
        // Single-line JSON to stdout; pino-http logs one line per request.
        autoLogging: true,
        // Never ship auth tokens to Loki; redact sensitive request headers.
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
        // Keep request/response logs compact instead of dumping all headers.
        serializers: {
          req(req: { id: unknown; method: string; url: string }) {
            return { id: req.id, method: req.method, url: req.url };
          },
          res(res: { statusCode: number }) {
            return { statusCode: res.statusCode };
          },
        },
      },
    }),
    DatabaseModule,
    AuthModule,
    TopicsModule,
    NotesModule,
    QuestionsModule,
    PracticeModule,
    AiModule,
    AiJobsModule,
    SearchModule,
    CommunityModule,
    InterviewsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AppErrorFilter }],
})
export class AppModule {}
