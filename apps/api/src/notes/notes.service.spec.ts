import { AppError } from '../common/app-error';
import { NotesService } from './notes.service';

describe('NotesService.create', () => {
  it('rejects title over 200 chars', async () => {
    const svc = new NotesService(
      { save: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      svc.create({ title: 'x'.repeat(201), bodyMarkdown: 'hi' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects body over 100000 chars', async () => {
    const svc = new NotesService(
      { save: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      svc.create({ title: 'ok', bodyMarkdown: 'y'.repeat(100001) }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
