import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { currentAccount } from '../accounts/account-context';
import { BaseRepository } from './base.repository';
import { PracticeAttempt } from '../entities/practice-attempt.entity';
import { PracticeAttemptQuestion } from '../entities/practice-attempt-question.entity';
import { AppError } from '../common/app-error';
import type { GradeResult } from '@kb/shared';
@Injectable()
export class PracticeAttemptsRepository extends BaseRepository<PracticeAttempt> {
  constructor(private readonly db: DataSource) {
    super(PracticeAttempt, db, true);
  }
  async pending() {
    return this.repo.find({
      where: { status: 'submitting' },
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }
  async createAttempt(
    a: PracticeAttempt,
    beforeSave?: (m: EntityManager) => Promise<void>,
  ) {
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'practice-create:' + a.userId,
      ]);
      const old = await m.findOneBy(PracticeAttempt, {
        userId: a.userId,
        requestKey: a.requestKey,
      });
      if (old) {
        if (old.payloadHash !== a.payloadHash)
          throw AppError.conflict('Mã yêu cầu đã được dùng cho nội dung khác.');
        old.items = await m.find(PracticeAttemptQuestion, {
          where: { attemptId: old.id },
          order: { position: 'ASC' },
        });
        return old;
      }
      await beforeSave?.(m);
      await m.save(PracticeAttempt, a);
      await m.save(PracticeAttemptQuestion, a.items);
      return a;
    });
  }
  async existing(key: string, hash: string) {
    const a = await this.repo.findOneBy({
      userId: currentAccount().id,
      requestKey: key,
    });
    if (!a) return null;
    if (a.payloadHash !== hash)
      throw AppError.conflict('Mã yêu cầu đã được dùng cho nội dung khác.');
    a.items = await this.db.manager.find(PracticeAttemptQuestion, {
      where: { attemptId: a.id },
      order: { position: 'ASC' },
    });
    return a;
  }
  async change<T>(
    id: string,
    work: (a: PracticeAttempt, m: EntityManager) => Promise<T>,
    userId = currentAccount().id,
  ) {
    return this.db.transaction(async (m) => {
      const a = await m.findOne(PracticeAttempt, {
        where: { id, userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!a) throw AppError.notFound();
      a.items = await m.find(PracticeAttemptQuestion, {
        where: { attemptId: id },
        order: { position: 'ASC' },
      });
      for (const i of a.items.filter((i) => i.state === 'grading' && i.jobId)) {
        const [job] = await m.query(
          'SELECT status,expires_at FROM ai_job WHERE id=$1',
          [i.jobId],
        );
        if (
          !job ||
          job.status === 'failed' ||
          (job.status !== 'succeeded' &&
            new Date(job.expires_at).getTime() <= Date.now())
        )
          i.state = 'grading_failed';
      }
      const result = await work(a, m);
      await m.save(PracticeAttempt, a);
      await m.save(PracticeAttemptQuestion, a.items);
      return result;
    });
  }
  async enqueue(
    m: EntityManager,
    a: PracticeAttempt,
    item: PracticeAttemptQuestion,
    request: unknown,
  ) {
    await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      'ai-owner:' + a.owner,
    ]);
    const [{ count }] = await m.query(
      "SELECT count(*) FROM ai_job WHERE owner=$1 AND status IN ('queued','running','retrying') AND expires_at>now()",
      [a.owner],
    );
    if (Number(count) >= 3) return false;
    const id = randomUUID();
    const payload = {
      dto: { action: 'grade-practice-answer', provider: a.provider },
      request,
      practice: {
        attemptId: a.id,
        itemId: item.id,
        userId: a.userId,
        revision: item.revision,
        snapshot: item.snapshot,
      },
    };
    await m.query(
      `INSERT INTO ai_job(id,owner,note_id,note_title,idempotency_key,payload_hash,action,provider,input,source_hash,expires_at,result_expires_at)
      VALUES($1,$2,NULL,'Chấm câu tự luận',$1,$5,'grade-practice-answer',$3,$4,$5,now()+interval '5 minutes',now()+interval '7 days')`,
      [id, a.owner, a.provider, JSON.stringify(payload), id],
    );
    await m.query('INSERT INTO ai_job_dispatch(job_id) VALUES($1)', [id]);
    item.jobId = id;
    item.state = 'grading';
    return true;
  }
  async finalize(
    m: EntityManager,
    input: {
      attemptId: string;
      itemId: string;
      userId: string;
      revision: number;
    },
    jobId: string,
    result: GradeResult,
  ) {
    const a = await m.findOne(PracticeAttempt, {
      where: { id: input.attemptId, userId: input.userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!a) throw AppError.notFound();
    const item = await m.findOneBy(PracticeAttemptQuestion, {
      id: input.itemId,
      attemptId: a.id,
    });
    if (
      !item ||
      item.jobId !== jobId ||
      item.revision !== input.revision ||
      item.state !== 'grading'
    )
      throw AppError.conflict('Kết quả chấm đã hết hiệu lực.');
    item.result = result;
    item.state = 'graded';
    await m.save(item);
    const pending = await m.count(PracticeAttemptQuestion, {
      where: { attemptId: a.id, state: 'graded' },
    });
    const total = await m.count(PracticeAttemptQuestion, {
      where: { attemptId: a.id },
    });
    if (a.status !== 'in_progress' && total === pending) {
      a.status = 'completed';
      await m.save(a);
    }
  }
}
