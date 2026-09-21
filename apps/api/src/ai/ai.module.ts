import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';

@Module({
  controllers: [AiController],
  providers: [AiService, LlmClient],
})
export class AiModule {}
