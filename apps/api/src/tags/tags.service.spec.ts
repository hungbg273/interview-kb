import { AppError } from '../common/app-error';
import { TagsService } from './tags.service';

describe('TagsService.remove', () => {
  it('conflicts when tag is attached to notes', async () => {
    const tags = {
      findById: jest.fn().mockResolvedValue({ id: 'g1' }),
      deleteById: jest.fn(),
    };
    const noteTags = { countByTag: jest.fn().mockResolvedValue(2) };
    const svc = new TagsService(tags as never, noteTags as never);
    await expect(svc.remove('g1')).rejects.toBeInstanceOf(AppError);
    expect(tags.deleteById).not.toHaveBeenCalled();
  });
});
