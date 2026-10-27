import { Module } from '@nestjs/common';
import { ChatgptStore } from './chatgpt.store';
import { ChatgptConnection } from './chatgpt.connection';
import { ChatgptClient } from './chatgpt.client';
import { ChatgptController } from './chatgpt.controller';
@Module({
  controllers: [ChatgptController],
  providers: [ChatgptStore, ChatgptConnection, ChatgptClient],
  exports: [ChatgptClient],
})
export class ChatgptModule {}
