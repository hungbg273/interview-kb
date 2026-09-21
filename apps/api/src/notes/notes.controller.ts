import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateNoteDto,
  ListNotesQuery,
  ReplaceTagsDto,
  UpdateNoteDto,
} from './dto';
import { NotesService } from './notes.service';

@ApiTags('notes')
@ApiCookieAuth('kb_access_token')
@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@Query() query: ListNotesQuery) {
    return this.notes.list(query);
  }

  @Post()
  create(@Body() dto: CreateNoteDto) {
    return this.notes.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.notes.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNoteDto) {
    return this.notes.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.notes.remove(id);
  }

  @Put(':id/tags')
  replaceTags(@Param('id') id: string, @Body() dto: ReplaceTagsDto) {
    return this.notes.replaceTags(id, dto.tagIds);
  }
}
