import { AppError } from '../common/app-error';
import { NotesService } from './notes.service';

describe('NotesService.create', () => {
  it('rejects title over 200 chars', async () => {
    const svc = new NotesService({ save: jest.fn() } as never, {} as never, {} as never);
    await expect(
      svc.create({ title: 'x'.repeat(201), bodyMarkdown: 'hi' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('rejects body over 100000 chars', async () => {
    const svc = new NotesService({ save: jest.fn() } as never, {} as never, {} as never);
    await expect(
      svc.create({ title: 'ok', bodyMarkdown: 'y'.repeat(100001) }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('rejects unknown topic ids with VALIDATION', async () => {
    const notes = {
      findById: jest.fn().mockResolvedValue({ id: 'n1' }),
    };
    const topics = { findById: jest.fn().mockResolvedValue(null) };
    const noteTopics = { replaceForNote: jest.fn() };
    const svc = new NotesService(notes as never, topics as never, noteTopics as never);
    await expect(svc.replaceTopics('n1', ['missing'])).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(noteTopics.replaceForNote).not.toHaveBeenCalled();
  });
});
