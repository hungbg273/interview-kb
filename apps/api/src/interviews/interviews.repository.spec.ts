import { InterviewsRepository } from './interviews.repository';
import { withAccount } from '../accounts/account-context';
import { setup } from './interview-fixtures';
import type { InterviewSession } from '@kb/shared';
import { Interviews1760000000009 } from '../migrations/1760000000009-Interviews';
import { migrations } from '../database/typeorm.config';

const owner = { id: 'account-id', email: 'a@example.com', displayName: 'A' };
const session: InterviewSession = {
  id: 'session-id',
  setup,
  context: { subjects: [], notes: [], characters: 0 },
  status: 'active',
  expiresAt: new Date().toISOString(),
  turns: [],
  feedback: null,
};
describe('InterviewsRepository', () => {
  it('reads and updates only the current owner under a database row lock', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { payload: structuredClone(session), credential_count: 0 },
      ])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn(async (work) => work({ query }));
    const repository = new InterviewsRepository({ transaction } as never);
    await withAccount(owner, () =>
      repository.lock(session.id, async (s, m) => {
        s.status = 'finished';
        m.credentials++;
      }),
    );
    expect(query.mock.calls[0][0]).toContain('user_id=$2 FOR UPDATE');
    expect(query.mock.calls[0][1]).toEqual([session.id, owner.id]);
    expect(query.mock.calls[1][0]).toContain('WHERE id=$1 AND user_id=$2');
    expect(JSON.parse(query.mock.calls[1][1][2]).status).toBe('finished');
    expect(query.mock.calls[1][1][3]).toBe(1);
  });
  it('does not update a foreign or missing session', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const repository = new InterviewsRepository({
      transaction: async (work) => work({ query }),
    } as never);
    await expect(
      withAccount(owner, () => repository.lock('missing', async () => {})),
    ).rejects.toMatchObject({ status: 404 });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('does not persist a turn when the provider throws inside the transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        { payload: structuredClone(session), credential_count: 0 },
      ]);
    const repository = new InterviewsRepository({
      transaction: async (work) => work({ query }),
    } as never);
    await expect(
      withAccount(owner, () =>
        repository.lock(session.id, async (s) => {
          s.turns.push({ id: 'u', role: 'user', text: 'answer' });
          throw new Error('upstream');
        }),
      ),
    ).rejects.toThrow('upstream');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('registers a reversible durable owner-scoped migration', async () => {
    expect(migrations).toContain(Interviews1760000000009);
    const query = jest.fn().mockResolvedValue([]);
    const migration = new Interviews1760000000009();
    await migration.up({ query } as never);
    expect(query.mock.calls[0][0]).toContain(
      'user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE',
    );
    expect(query.mock.calls[0][0]).toContain('payload jsonb NOT NULL');
    await migration.down({ query } as never);
    expect(query.mock.calls.at(-1)?.[0]).toBe('DROP TABLE interview_session');
  });
});
