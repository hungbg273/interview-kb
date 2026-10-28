import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { InterviewsService } from './interviews.service';
import {
  InterviewSetupDto,
  InterviewTranscriptDto,
  InterviewTurnDto,
  InterviewVoicePreviewDto,
} from './dto';

@ApiTags('interviews')
@ApiCookieAuth('kb_access_token')
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}
  @Header('Cache-Control', 'no-store')
  @Get('providers')
  providers() {
    return this.interviews.providers();
  }
  @Header('Cache-Control', 'no-store')
  @Post('voice-preview')
  @HttpCode(200)
  voicePreview(@Body() dto: InterviewVoicePreviewDto) {
    return this.interviews.voicePreview(dto);
  }
  @Header('Cache-Control', 'no-store')
  @Post('documents')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  document(
    @UploadedFile()
    file:
      { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  ) {
    return this.interviews.prepareDocument(file);
  }
  @Header('Cache-Control', 'no-store')
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: InterviewSetupDto) {
    return this.interviews.preview(dto);
  }
  @Header('Cache-Control', 'no-store')
  @Post()
  start(@Body() dto: InterviewSetupDto) {
    return this.interviews.start(dto);
  }
  @Header('Cache-Control', 'no-store')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.get(id);
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/turn')
  @HttpCode(200)
  turn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InterviewTurnDto) {
    return this.interviews.turn(id, dto);
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/transcript')
  @HttpCode(200)
  transcript(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InterviewTranscriptDto,
  ) {
    return this.interviews.transcript(id, dto.turns);
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/realtime')
  @HttpCode(200)
  realtime(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.realtime(id);
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/finish')
  @HttpCode(200)
  finish(@Param('id', ParseUUIDPipe) id: string) {
    return this.interviews.finish(id);
  }
}
