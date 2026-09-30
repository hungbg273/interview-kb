import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';

@Injectable()
export class DocumentExtractor {
  async extract(buffer: Buffer, mime: string, filename: string): Promise<string> {
    const name = filename.toLowerCase();
    const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
    const isDocx =
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx');
    if (!isPdf && !isDocx) {
      throw AppError.validation('Upload a PDF or DOCX file');
    }
    if (isPdf) {
      const pdfParse = (await import('pdf-parse')).default as (
        data: Buffer,
      ) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      return parsed.text ?? '';
    }
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? '';
  }
}
