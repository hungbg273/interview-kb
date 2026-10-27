import { PracticeModule } from '../practice/practice.module';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { ChatgptModule } from '../chatgpt/chatgpt.module';
import { AI_QUEUE, redisConnection } from './ai-queue';
import { AiJobsService } from './ai-jobs.service';
import { AiJobsController } from './ai-jobs.controller';
import { AiDispatcher } from './ai-dispatcher.service';
import { AiProcessor } from './ai.processor';
@Module({
  imports: [
    AiModule,
    PracticeModule,
    ChatgptModule,
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          ...redisConnection(),
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        },
      }),
    }),
    BullModule.registerQueue({ name: AI_QUEUE }),
  ],
  providers: [AiJobsService, AiDispatcher, AiProcessor],
  controllers: [AiJobsController],
})
export class AiJobsModule {}
