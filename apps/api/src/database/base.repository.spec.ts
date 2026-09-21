import { QueryFailedError } from 'typeorm';
import { BaseRepository } from './base.repository';

describe('BaseRepository.isUniqueViolation', () => {
  const repo = Object.create(BaseRepository.prototype) as BaseRepository<{
    id: string;
  }>;

  it('detects Postgres unique violation 23505', () => {
    const error = new QueryFailedError('INSERT', [], { code: '23505' });
    expect(repo.isUniqueViolation(error)).toBe(true);
  });

  it('ignores other errors', () => {
    expect(repo.isUniqueViolation(new Error('nope'))).toBe(false);
    expect(
      repo.isUniqueViolation(new QueryFailedError('SELECT', [], { code: '23503' })),
    ).toBe(false);
  });
});
