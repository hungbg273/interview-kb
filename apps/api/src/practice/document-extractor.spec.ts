import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DocumentExtractor } from './document-extractor';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../../test/fixtures', name));

describe('DocumentExtractor with the real PDF parser', () => {
  it('extracts selectable PDF text without loading the library demo files', async () => {
    await expect(
      new DocumentExtractor().extract(
        fixture('text-document.pdf'),
        'application/pdf',
        'role.pdf',
      ),
    ).resolves.toContain('Backend engineer role');
  });

  it('recognizes PDFs with generic MIME types and keeps different documents separate', async () => {
    const extractor = new DocumentExtractor();
    await extractor.extract(
      fixture('text-document.pdf'),
      'application/pdf',
      'role.pdf',
    );
    await expect(
      extractor.extract(
        fixture('second-document.pdf'),
        'application/octet-stream',
        'ROLE.PDF',
      ),
    ).resolves.toContain('Database transactions');
  });

  it('loads the parser outside Jest in the native Node runtime used by the API', () => {
    const code = `
      const {readFileSync}=require('node:fs');
      const {DocumentExtractor}=require('./src/practice/document-extractor.ts');
      new DocumentExtractor().extract(readFileSync('./test/fixtures/text-document.pdf'),'application/pdf','role.pdf')
        .then(text=>console.log(text.trim()))
        .catch(error=>{console.error(error.message);process.exitCode=1;});
    `;
    const text = execFileSync(
      process.execPath,
      ['--import', 'tsx', '-e', code],
      { cwd: resolve(__dirname, '../..'), encoding: 'utf8' },
    );
    expect(text.trim()).toBe('Backend engineer role');
  });

  it('rejects malformed PDFs rather than returning fabricated text', async () => {
    await expect(
      new DocumentExtractor().extract(
        Buffer.from('not a PDF'),
        'application/pdf',
        'broken.pdf',
      ),
    ).rejects.toThrow();
  });
});
