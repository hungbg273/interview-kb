import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { NoteChatService } from './note-chat.service';
import { ChatRevisionDto, SendNoteChatDto } from './dto';
@ApiTags('note-chat')
@ApiCookieAuth('kb_access_token')
@Controller('notes/:id/chat')
export class NoteChatController {
  constructor(private readonly chat: NoteChatService) {}
  @Get() history(@Param('id', ParseUUIDPipe) id: string) {
    return this.chat.history(id);
  }
  @Post() send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendNoteChatDto,
  ) {
    return this.chat.send(id, dto);
  }
  @Post('clear') clear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChatRevisionDto,
  ) {
    return this.chat.clear(id, dto.revision);
  }
}
