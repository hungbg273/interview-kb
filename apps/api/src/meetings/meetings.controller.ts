import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AppError } from '../common/app-error';
import {
  MeetingAudioDto,
  MeetingCaptionDto,
  MeetingContextDto,
  MeetingSetupDto,
  MeetingSuggestionDto,
} from './dto';
import { MAX_MEETING_AUDIO_BYTES } from './meeting-ai';
import { MeetingsService } from './meetings.service';

async function untilDisconnect<T>(
  req: Request,
  res: Response,
  work: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.once('aborted', abort);
  res.once('close', abort);
  if (req.aborted || res.destroyed) controller.abort();
  try {
    return await work(controller.signal);
  } finally {
    req.off('aborted', abort);
    res.off('close', abort);
  }
}
@ApiTags('meetings')
@ApiCookieAuth('kb_access_token')
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}
  @Header('Cache-Control', 'no-store')
  @Post()
  start(@Body() dto: MeetingSetupDto) {
    return this.meetings.start(dto);
  }
  @Header('Cache-Control', 'no-store')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.get(id);
  }
  @Header('Cache-Control', 'no-store')
  @Patch(':id/context')
  context(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MeetingContextDto,
  ) {
    return this.meetings.context(id, dto);
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/captions')
  @HttpCode(200)
  caption(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MeetingCaptionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return untilDisconnect(req, res, (signal) =>
      this.meetings.caption(id, dto, signal),
    );
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/audio')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_MEETING_AUDIO_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 32,
        parts: 2,
      },
    }),
  )
  audio(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MeetingAudioDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!file) throw AppError.validation('Audio file is required.');
    return untilDisconnect(req, res, (signal) =>
      this.meetings.audio(id, dto.sequence, file.buffer, signal),
    );
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/suggestions')
  @HttpCode(200)
  suggestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MeetingSuggestionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return untilDisconnect(req, res, (signal) =>
      this.meetings.suggest(id, dto, signal),
    );
  }
  @Header('Cache-Control', 'no-store')
  @Post(':id/stop')
  @HttpCode(200)
  stop(@Param('id', ParseUUIDPipe) id: string) {
    return this.meetings.stop(id);
  }
}
