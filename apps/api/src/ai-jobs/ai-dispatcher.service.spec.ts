import { AiDispatcher } from './ai-dispatcher.service';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { AiJobsService } from './ai-jobs.service';

function setup() {
  const row = {
    id: 'job',
    status: 'running',
    attempts: 1,
    dispatched_at: null as Date | null,
  };
  const db = {
    query: jest.fn(async (sql: string, values?: unknown[]) => {
      if (sql.startsWith('SELECT * FROM ai_job')) return [];
      if (sql.startsWith('SELECT j.'))
        return values?.[0] || !row.dispatched_at ? [{ ...row }] : [];
      if (sql.startsWith('UPDATE ai_job_dispatch SET dispatched_at=NULL'))
        row.dispatched_at = null;
      else if (sql.startsWith('UPDATE ai_job_dispatch'))
        row.dispatched_at = new Date();
      return [];
    }),
  };
  const queued = {
    getState: jest.fn(async () => 'active'),
    retry: jest.fn(),
    remove: jest.fn(),
  };
  const queue = {
    on: jest.fn(),
    add: jest.fn(async () => queued),
    getJob: jest.fn(async () => queued),
  };
  const jobs = { fail: jest.fn() };
  const dispatcher = new AiDispatcher(
    db as unknown as DataSource,
    queue as unknown as Queue,
    jobs as unknown as AiJobsService,
  );
  return { row, db, queue, queued, jobs, dispatcher };
}

describe('durable AI dispatch cadence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-07T00:00:00Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('enqueues fresh work directly and reconciles dispatched work only once a minute', async () => {
    const { dispatcher, queue } = setup();
    await dispatcher.tick();
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.getJob).not.toHaveBeenCalled();
    for (let i = 0; i < 11; i++) {
      jest.advanceTimersByTime(5000);
      await dispatcher.tick();
    }
    expect(queue.getJob).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    await dispatcher.tick();
    expect(queue.getJob).toHaveBeenCalledTimes(1);
  });

  it('restores a missing queue entry during reconciliation', async () => {
    const { dispatcher, row, queue } = setup();
    row.dispatched_at = new Date();
    queue.getJob.mockResolvedValueOnce(undefined as never);
    await dispatcher.tick();
    expect(queue.add).toHaveBeenCalledWith(
      'generate',
      { jobId: row.id },
      expect.objectContaining({ jobId: row.id }),
    );
  });

  it('backs off queue failures without stopping expiration and cleanup', async () => {
    const { dispatcher, db, queue } = setup();
    queue.add.mockRejectedValue(new Error('offline'));
    await dispatcher.tick();
    await dispatcher.tick();
    expect(queue.add).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5000);
    await dispatcher.tick();
    expect(queue.add).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5000);
    await dispatcher.tick();
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(
      db.query.mock.calls.filter(([sql]) =>
        sql.startsWith('SELECT * FROM ai_job'),
      ),
    ).toHaveLength(4);
    jest.advanceTimersByTime(20000);
    await dispatcher.tick();
    expect(
      db.query.mock.calls.filter(([sql]) =>
        sql.startsWith('DELETE FROM practice_import_draft'),
      ),
    ).toHaveLength(2);
  });

  it('keeps durable maintenance running while Redis readiness is unresolved', async () => {
    const { dispatcher, db, queue, queued } = setup();
    let release!: () => void;
    queue.add.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(queued);
        }),
    );
    const first = dispatcher.tick();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(queue.add).toHaveBeenCalledTimes(1);
    try {
      jest.advanceTimersByTime(30000);
      await dispatcher.tick();
      expect(
        db.query.mock.calls.filter(([sql]) =>
          sql.startsWith('SELECT * FROM ai_job'),
        ),
      ).toHaveLength(2);
      expect(
        db.query.mock.calls.filter(([sql]) =>
          sql.startsWith('DELETE FROM practice_import_draft'),
        ),
      ).toHaveLength(2);
      expect(queue.add).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await first;
    }
  });

  it('leaves completed work with unfinished output pending for dispatch on the next scan', async () => {
    const { dispatcher, row, queue, queued } = setup();
    Object.assign(row, {
      dispatched_at: new Date(),
      output: { markdown: 'saved' },
    });
    queued.getState.mockResolvedValue('completed');
    await dispatcher.tick();
    expect(queued.remove).toHaveBeenCalled();
    expect(row.dispatched_at).toBeNull();
    jest.advanceTimersByTime(5000);
    await dispatcher.tick();
    expect(queue.add).toHaveBeenCalledTimes(1);
  });
});
