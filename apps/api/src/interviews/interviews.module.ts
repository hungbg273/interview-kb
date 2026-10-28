import { Module } from '@nestjs/common';
import { LlmClient } from '../ai/llm.client';
import { DocumentExtractor } from '../practice/document-extractor';
import { InterviewContextResolver } from './interview-context';
import { InterviewGateway } from './interview-gateway';
import { InterviewsController } from './interviews.controller';
import { InterviewsRepository } from './interviews.repository';
import { InterviewsService } from './interviews.service';
@Module({
  controllers: [InterviewsController],
  providers: [
    InterviewsService,
    InterviewsRepository,
    InterviewContextResolver,
    InterviewGateway,
    LlmClient,
    DocumentExtractor,
  ],
})
export class InterviewsModule {}
