import { AppError } from '../common/app-error';
import { TopicsService } from './topics.service';

function svc(partial: {
  topics?: object;
  parents?: object;
}) {
  return new TopicsService(
    (partial.topics ?? {}) as never,
    (partial.parents ?? {}) as never,
  );
}

describe('TopicsService', () => {
  it('404 when topic is missing', async () => {
    const topics = { findById: jest.fn().mockResolvedValue(null) };
    await expect(svc({ topics }).get('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('deletes a topic even when it has children and notes', async () => {
    const topics = {
      findById: jest.fn().mockResolvedValue({ id: 't1' }),
      deleteById: jest.fn().mockResolvedValue(undefined),
    };
    await svc({ topics }).remove('t1');
    expect(topics.deleteById).toHaveBeenCalledWith('t1');
  });

  it('addParent returns CYCLE when the edge would loop', async () => {
    const topics = {
      findById: jest.fn().mockImplementation(async (id: string) => ({ id })),
    };
    const parents = {
      listEdges: jest.fn().mockResolvedValue([{ parentId: 'A', childId: 'B' }]),
      exists: jest.fn().mockResolvedValue(false),
      add: jest.fn(),
    };
    await expect(svc({ topics, parents }).addParent('A', 'B')).rejects.toMatchObject({
      code: 'CYCLE',
    });
    expect(parents.add).not.toHaveBeenCalled();
  });

  it('addParent returns CONFLICT when the edge already exists', async () => {
    const topics = {
      findById: jest.fn().mockImplementation(async (id: string) => ({ id })),
    };
    const parents = {
      listEdges: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(true),
      add: jest.fn(),
    };
    await expect(svc({ topics, parents }).addParent('B', 'A')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
