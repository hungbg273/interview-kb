import { currentAccount, withAccount } from './account-context';
import { BaseRepository } from '../database/base.repository';
import { Note } from '../entities/note.entity';
const alice = {
  id: 'alice',
  email: 'alice@example.invalid',
  displayName: 'Alice',
};
const bob = { id: 'bob', email: 'bob@example.invalid', displayName: 'Bob' };
it('fails closed without an authenticated account', () => {
  expect(() => currentAccount()).toThrow();
});
it('isolates simultaneous requests across async work', async () => {
  await Promise.all(
    [alice, bob].map((user) =>
      withAccount(user, async () => {
        await Promise.resolve();
        expect(currentAccount().id).toBe(user.id);
      }),
    ),
  );
});
it('scopes private reads, writes and deletes to the account', async () => {
  const repo = { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() };
  const base = new BaseRepository(
    Note,
    { getRepository: () => repo } as never,
    true,
  );
  await withAccount(alice, async () => {
    await base.findById('n1');
    await base.save({ title: 'Private', bodyMarkdown: 'Body' });
    await base.deleteById('n1');
  });
  expect(repo.findOne).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'n1', userId: 'alice' } }),
  );
  expect(repo.save).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'alice' }),
  );
  expect(repo.delete).toHaveBeenCalledWith({ id: 'n1', userId: 'alice' });
});
