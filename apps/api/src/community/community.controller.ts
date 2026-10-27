import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Delete,
  Query,
} from '@nestjs/common';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CommunityService } from './community.service';
class FeedQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
}
class CloneDto {
  @IsOptional() @IsUUID() topicId?: string;
}
@Controller()
export class CommunityController {
  constructor(private readonly community: CommunityService) {}
  @Get('community/notes') list(@Query() query: FeedQuery) {
    return this.community.list(query.page);
  }
  @Get('community/notes/:id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.community.detail(id);
  }
  @Post('community/notes/:id/clone') clone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneDto,
  ) {
    return this.community.clone(id, dto.topicId);
  }
  @Get('notes/:id/publication') status(@Param('id', ParseUUIDPipe) id: string) {
    return this.community.status(id);
  }
  @Post('notes/:id/publication') publish(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.community.publish(id);
  }
  @Delete('notes/:id/publication') unpublish(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.community.unpublish(id);
  }
}
