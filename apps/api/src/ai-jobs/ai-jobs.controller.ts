import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { StartImportDto } from '../practice/dto';
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Headers,
  HttpCode,
  Sse,
  Query,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { merge, interval, map, filter, takeUntil, timer, finalize } from 'rxjs';
import { RunAiDto } from '../ai/dto';
import { AiJobsService } from './ai-jobs.service';
import { AppError } from '../common/app-error';
type AuthRequest = { user: { email: string; exp?: number } };
@Controller()
export class AiJobsController {
  constructor(private readonly jobs: AiJobsService) {}
  @Post('notes/:id/ai-jobs')
  @HttpCode(202)
  async create(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RunAiDto,
    @Headers('idempotency-key') key: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key || '',
      )
    )
      throw AppError.validation('Cần Idempotency-Key dạng UUID.');
    try {
      const job = await this.jobs.create(req.user.email, id, dto, key);
      res.setHeader('Location', '/ai-jobs/' + job.id);
      return { ...job, jobId: job.id };
    } catch (error) {
      if (error instanceof AppError && error.getStatus() === 429)
        res.setHeader('Retry-After', '10');
      if (error instanceof AppError) throw error;
      throw new AppError(
        'AI_JOB_UNAVAILABLE',
        'Chưa lưu được yêu cầu AI. Vui lòng thử lại.',
        503,
      );
    }
  }
  @Post('practice/import-jobs')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async importDocument(
    @Req() req: AuthRequest,
    @UploadedFile()
    file:
      { buffer: Buffer; originalname: string; mimetype: string } | undefined,
    @Body() dto: StartImportDto,
    @Headers('idempotency-key') key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!file) throw AppError.validation('Cần tải tệp PDF hoặc DOCX.');
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        key || '',
      )
    )
      throw AppError.validation('Cần Idempotency-Key dạng UUID.');
    if (
      ![
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.mimetype)
    )
      throw AppError.validation('Chỉ hỗ trợ PDF và DOCX.');
    const job = await this.jobs.createImport(
      req.user.email,
      {
        ...dto,
        owner: req.user.email,
        filename: file.originalname,
        mime: file.mimetype,
        buffer: file.buffer,
      },
      key,
    );
    res.setHeader('Location', '/ai-jobs/' + job.id);
    return { ...job, jobId: job.id };
  }
  @Get('ai-jobs') list(
    @Req() req: AuthRequest,
    @Query('status') status?: string,
  ) {
    return this.jobs.list(req.user.email, status === 'active');
  }
  @Sse('ai-jobs/events') events(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    const ttl = Math.max(
      0,
      (req.user.exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000 -
        Date.now(),
    );
    return merge(
      this.jobs.changes.pipe(
        filter((item) => item.owner === req.user.email),
        map(({ job }) => ({
          type: 'job.updated',
          id: job.id + ':' + job.revision,
          data: job,
        })),
      ),
      interval(15000).pipe(
        map(() => ({ type: 'heartbeat', data: { time: Date.now() } })),
      ),
    ).pipe(takeUntil(timer(ttl)));
  }
  @Post('ai-jobs/:id/retry')
  @HttpCode(202)
  async retry(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('idempotency-key') key: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const old = await this.jobs.owned(req.user.email, id);
    if (old.status !== 'failed')
      throw AppError.conflict('Chỉ thử lại yêu cầu đã thất bại.');
    if (old.input.import) {
      const { base64, ...input } = old.input.import;
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          key || '',
        )
      )
        throw AppError.validation('Cần Idempotency-Key dạng UUID.');
      const job = await this.jobs.createImport(
        req.user.email,
        { ...input, buffer: Buffer.from(base64, 'base64') },
        key,
      );
      res.setHeader('Location', '/ai-jobs/' + job.id);
      return { ...job, jobId: job.id };
    }
    if (!old.note_id) throw AppError.notFound();
    return this.create(old.note_id, old.input.dto, key, req, res);
  }
  @Get('ai-jobs/:id') get(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.get(req.user.email, id);
  }
  @Get('ai-jobs/:id/result') result(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.result(req.user.email, id);
  }
  @Post('ai-jobs/:id/apply') apply(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.apply(req.user.email, id);
  }
}
