import { ChatgptModule } from '../chatgpt/chatgpt.module';
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';
import { TranscriptClient } from './transcript.client';

@Module({
  imports: [ChatgptModule],
  controllers: [AiController],
  providers: [AiService, LlmClient, TranscriptClient],
  exports: [AiService, TranscriptClient],
})
export class AiModule {}
