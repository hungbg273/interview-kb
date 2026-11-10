import { PracticeQuestionsQuery } from './dto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PracticeAttemptsService } from './practice-attempts.service';
import {
  CreateAttemptDto,
  SavePracticeAnswerDto,
} from './practice-attempts.dto';
@Controller('practice/attempts')
export class PracticeAttemptsController {
  constructor(private readonly service: PracticeAttemptsService) {}
  @Post() create(@Body() dto: CreateAttemptDto) {
    return this.service.create(dto);
  }
  @Get('options') options(@Query() query: PracticeQuestionsQuery) {
    return this.service.options(query);
  }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }
  @Patch(':id/questions/:itemId/answer') save(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SavePracticeAnswerDto,
  ) {
    return this.service.save(id, itemId, dto);
  }
  @Post(':id/questions/:itemId/grade') @HttpCode(200) grade(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SavePracticeAnswerDto,
  ) {
    return this.service.grade(id, itemId, dto);
  }
  @Post(':id/submit') @HttpCode(202) submit(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.submit(id);
  }
  @Post(':id/retry') @HttpCode(202) retry(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.submit(id, true);
  }
}
