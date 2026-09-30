import { Module } from '@nestjs/common';
import { LlmClient } from '../ai/llm.client';
import { TopicsModule } from '../topics/topics.module';
import { DocumentExtractor } from './document-extractor';
import { PracticeController } from './practice.controller';
import { PracticeImportService } from './practice-import.service';
import { PracticeService } from './practice.service';

@Module({
  imports: [TopicsModule],
  controllers: [PracticeController],
  providers: [PracticeService, PracticeImportService, DocumentExtractor, LlmClient],
})
export class PracticeModule {}
