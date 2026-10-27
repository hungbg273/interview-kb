import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  AddParentDto,
  CreateTopicDto,
  ListTopicsQuery,
  UpdateTopicDto,
} from './dto';
import { TopicsService } from './topics.service';

@ApiTags('topics')
@ApiCookieAuth('kb_access_token')
@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  list(@Query() query: ListTopicsQuery) {
    return this.topics.list(query.parentId);
  }

  @Get('catalog')
  catalog() {
    return this.topics.catalog();
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

  @Post(':id/parents')
  addParent(@Param('id') id: string, @Body() dto: AddParentDto) {
    return this.topics.addParent(id, dto.parentId);
  }

  @Delete(':id/parents/:parentId')
  @HttpCode(204)
  removeParent(@Param('id') id: string, @Param('parentId') parentId: string) {
    return this.topics.removeParent(id, parentId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.topics.remove(id);
  }
}
