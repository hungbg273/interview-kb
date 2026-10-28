import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { InterviewSession } from '@kb/shared';
import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';

@Injectable()
export class InterviewsRepository {
  constructor(private readonly db: DataSource) {}
  async create(session: InterviewSession): Promise<InterviewSession> {
    await this.db.query(
      'INSERT INTO interview_session(id,user_id,payload) VALUES($1,$2,$3::jsonb)',
      [session.id, currentAccount().id, JSON.stringify(session)],
    );
    return session;
  }
  async get(id: string): Promise<InterviewSession> {
    const [row] = await this.db.query<Array<{ payload: InterviewSession }>>(
      'SELECT payload FROM interview_session WHERE id=$1 AND user_id=$2',
      [id, currentAccount().id],
    );
    if (!row) throw AppError.notFound('Interview not found.');
    return row.payload;
  }
  async lock<T>(
    id: string,
    work: (
      session: InterviewSession,
      metadata: { credentials: number },
    ) => Promise<T>,
  ): Promise<T> {
    const owner = currentAccount().id;
    return this.db.transaction(async (manager) => {
      // Hold the row lock across provider work so multiple processes cannot bill duplicate turns.
      const [row] = await manager.query<
        Array<{ payload: InterviewSession; credential_count: number }>
      >(
        'SELECT payload,credential_count FROM interview_session WHERE id=$1 AND user_id=$2 FOR UPDATE',
        [id, owner],
      );
      if (!row) throw AppError.notFound('Interview not found.');
      const metadata = { credentials: row.credential_count };
      const result = await work(row.payload, metadata);
      await manager.query(
        'UPDATE interview_session SET payload=$3::jsonb,credential_count=$4,updated_at=now() WHERE id=$1 AND user_id=$2',
        [id, owner, JSON.stringify(row.payload), metadata.credentials],
      );
      return result;
    });
  }
}
