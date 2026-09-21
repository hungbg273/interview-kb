import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CreateQuestionDto, UpdateQuestionDto } from './dto';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@ApiCookieAuth('kb_access_token')
@Controller()
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Post('notes/:noteId/questions')
  create(@Param('noteId') noteId: string, @Body() dto: CreateQuestionDto) {
    return this.questions.create(noteId, dto);
  }

  @Patch('questions/:id')
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questions.update(id, dto);
  }

  @Delete('questions/:id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.questions.remove(id);
  }
}
