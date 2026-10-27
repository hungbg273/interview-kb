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
  controllers: [PracticeController],
  providers: [
    PracticeService,
    PracticeImportService,
    DocumentExtractor,
    LlmClient,
  ],
})
export class PracticeModule {}
