import { Injectable } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import { AppError } from '../common/app-error';

// PDF.js accepts Uint8Array, although pdf-parse 1.x's type declaration only
// mentions Buffer. Buffer.slice() returns views; PDF.js expects copying slices.
const parsePdfBytes = pdfParse as (
  data: Uint8Array,
) => ReturnType<typeof pdfParse>;

// Postgres text/jsonb rejects the NUL character (error 22P05). PDF ligatures
// (fl, fi) often decode to \u0000, so strip it from every extracted document
// before the text is stored or sent to a provider.
const stripNull = (text: string) => text.replace(/\u0000/g, '');

@Injectable()
export class DocumentExtractor {
  async extract(
    buffer: Buffer,
    mime: string,
    filename: string,
  ): Promise<string> {
    const name = filename.toLowerCase();
    const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
    const isDocx =
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx');
    if (!isPdf && !isDocx) {
      throw AppError.validation('Upload a PDF or DOCX file');
    }
    if (isPdf) {
      // Native dynamic import of pdf-parse 1.x runs its demo entrypoint because
      // module.parent is unset. A static CJS import avoids that missing test file.
      const parsed = await parsePdfBytes(new Uint8Array(buffer));
      return stripNull(parsed.text ?? '');
    }
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return stripNull(result.value ?? '');
  }
}
