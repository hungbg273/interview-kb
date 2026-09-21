import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CreateTopicDto, UpdateTopicDto } from './dto';
import { TopicsService } from './topics.service';

@ApiTags('topics')
@ApiCookieAuth('kb_access_token')
@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  list() {
    return this.topics.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.topics.get(id);
  }

  @Post()
  create(@Body() dto: CreateTopicDto) {
    return this.topics.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.topics.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.topics.remove(id);
  }
}
