import { Module } from '@nestjs/common';
import { ChatgptModule } from '../chatgpt/chatgpt.module';
import { LlmClient } from '../ai/llm.client';
import { NoteChatRepository } from '../database/note-chat.repository';
import { NoteChatController } from './note-chat.controller';
import { NoteChatService } from './note-chat.service';
@Module({
  imports: [ChatgptModule],
  controllers: [NoteChatController],
  providers: [NoteChatRepository, NoteChatService, LlmClient],
})
export class NoteChatModule {}
