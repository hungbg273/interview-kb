import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { NoteImagesRepository } from '../database/note-images.repository';
import { AppError } from '../common/app-error';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
type ImageUpload = { buffer: Buffer; mimetype: string };
const FORMATS = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
} as const;
@Injectable()
export class NoteImagesService {
  constructor(private readonly images: NoteImagesRepository) {}
  async upload(file: ImageUpload | undefined) {
    if (!file?.buffer.length)
      throw AppError.validation('Chưa có ảnh để tải lên.');
    if (file.buffer.length > MAX_IMAGE_BYTES)
      throw new AppError('IMAGE_TOO_LARGE', 'Ảnh vượt quá 5 MB.', 413);
    const format = FORMATS[file.mimetype as keyof typeof FORMATS];
    if (!format) throw AppError.validation('Chỉ hỗ trợ ảnh PNG, JPEG và WebP.');
    // Re-encode real pixels rather than trusting the filename or MIME header.
    let data: Buffer, width: number, height: number;
    try {
      const pipeline = sharp(file.buffer, {
        limitInputPixels: 25_000_000,
        failOn: 'error',
      });
      const metadata = await pipeline.metadata();
      if (metadata.format !== format || (metadata.pages ?? 1) > 1)
        throw new Error('Unsupported image');
      const output = await pipeline
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toFormat(format)
        .toBuffer({ resolveWithObject: true });
      data = output.data;
      width = output.info.width;
      height = output.info.height;
    } catch {
      throw AppError.validation(
        'Ảnh không hợp lệ, quá lớn về kích thước hoặc có nhiều khung hình.',
      );
    }
    if (data.length > MAX_IMAGE_BYTES)
      throw new AppError(
        'IMAGE_TOO_LARGE',
        'Ảnh sau xử lý vượt quá 5 MB.',
        413,
      );
    const row = await this.images.save({
      mimeType: file.mimetype,
      data,
      width,
      height,
    });
    return { id: row.id, url: `/note-images/${row.id}`, width, height };
  }
  async get(id: string) {
    const row = await this.images.readable(id);
    if (!row) throw AppError.notFound('Không tìm thấy ảnh.');
    return row;
  }
}
