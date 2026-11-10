import { PracticeAttemptsRepository } from '../database/practice-attempts.repository';
import { PracticeGradingService } from './practice-grading.service';
import { PracticeAttemptsService } from './practice-attempts.service';
import { PracticeAttemptsController } from './practice-attempts.controller';
import { ChatgptModule } from '../chatgpt/chatgpt.module';
import { Module } from '@nestjs/common';
import { LlmClient } from '../ai/llm.client';
import { TopicsModule } from '../topics/topics.module';
import { DocumentExtractor } from './document-extractor';
import { PracticeController } from './practice.controller';
import { PracticeImportService } from './practice-import.service';
import { PracticeService } from './practice.service';

@Module({
  imports: [TopicsModule, ChatgptModule],
  exports: [
    PracticeImportService,
    PracticeAttemptsRepository,
    PracticeAttemptsService,
  ],
  controllers: [PracticeController, PracticeAttemptsController],
  providers: [
    PracticeService,
    PracticeAttemptsRepository,
    PracticeGradingService,
    PracticeAttemptsService,
    PracticeImportService,
    DocumentExtractor,
    LlmClient,
  ],
})
export class PracticeModule {}
