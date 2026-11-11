import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { MAX_IMAGE_BYTES, NoteImagesService } from './note-images.service';

@Controller('note-images')
export class NoteImagesController {
  constructor(private readonly images: NoteImagesService) {}
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(
    @UploadedFile() file: { buffer: Buffer; mimetype: string } | undefined,
  ) {
    return this.images.upload(file);
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const image = await this.images.get(id);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Content-Length', image.data.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.send(image.data);
  }
}
