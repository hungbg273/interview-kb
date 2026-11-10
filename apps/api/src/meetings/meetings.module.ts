import { Module } from '@nestjs/common';
import { LlmClient } from '../ai/llm.client';
import { MeetingAi } from './meeting-ai';
import { MeetingSessions } from './meeting-sessions';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingSessions, MeetingAi, LlmClient],
})
export class MeetingsModule {}
