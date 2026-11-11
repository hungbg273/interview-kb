import sharp from 'sharp';
import { NoteImagesService } from './note-images.service';
import { NoteImagesRepository } from '../database/note-images.repository';

describe('note image uploads', () => {
  const save = jest.fn();
  const readable = jest.fn();
  const service = new NoteImagesService({
    save,
    readable,
  } as unknown as NoteImagesRepository);
  beforeEach(() => {
    save.mockReset();
    readable.mockReset();
    save.mockImplementation(async (value) => ({ ...value, id: 'image-id' }));
  });
  it('decodes, normalizes and stores real image bytes independently of a note', async () => {
    const input = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#00aa88' },
    })
      .png()
      .toBuffer();
    const result = await service.upload({
      buffer: input,
      mimetype: 'image/png',
    });
    expect(result).toEqual({
      id: 'image-id',
      url: '/note-images/image-id',
      width: 2400,
      height: 1200,
    });
    const stored = save.mock.calls[0][0];
    expect((await sharp(stored.data).metadata()).format).toBe('png');
    expect(stored.mimeType).toBe('image/png');
  });
  it('rejects unsupported, disguised, corrupt and oversized images before saving', async () => {
    for (const file of [
      undefined,
      { buffer: Buffer.from('<svg/>'), mimetype: 'image/svg+xml' },
      { buffer: Buffer.from('<svg/>'), mimetype: 'image/png' },
      { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: 'image/png' },
    ]) {
      await expect(service.upload(file)).rejects.toThrow();
    }
    expect(save).not.toHaveBeenCalled();
  });
  it('does not return bytes without repository access authorization', async () => {
    readable.mockResolvedValue(null);
    await expect(service.get('foreign')).rejects.toMatchObject({ status: 404 });
  });
});
