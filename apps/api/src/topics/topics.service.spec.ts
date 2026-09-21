import { AppError } from '../common/app-error';
import { TopicsService } from './topics.service';

describe('TopicsService.remove', () => {
  it('conflicts when topic has children', async () => {
    const topics = {
      findById: jest.fn().mockResolvedValue({ id: 't1' }),
      countChildren: jest.fn().mockResolvedValue(1),
      deleteById: jest.fn(),
    };
    const notes = { countByTopic: jest.fn() };
    const svc = new TopicsService(topics as never, notes as never);
    await expect(svc.remove('t1')).rejects.toBeInstanceOf(AppError);
    expect(topics.deleteById).not.toHaveBeenCalled();
  });

  it('conflicts when topic still has notes', async () => {
    const topics = {
      findById: jest.fn().mockResolvedValue({ id: 't1' }),
      countChildren: jest.fn().mockResolvedValue(0),
      deleteById: jest.fn(),
    };
    const notes = { countByTopic: jest.fn().mockResolvedValue(2) };
    const svc = new TopicsService(topics as never, notes as never);
    await expect(svc.remove('t1')).rejects.toBeInstanceOf(AppError);
    expect(topics.deleteById).not.toHaveBeenCalled();
  });

  it('404 when topic is missing', async () => {
    const topics = { findById: jest.fn().mockResolvedValue(null) };
    const svc = new TopicsService(topics as never, {} as never);
    await expect(svc.get('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
