import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { AI_QUEUE } from './ai-queue';
import { AiJobsService, StoredJob } from './ai-jobs.service';
import { AppError } from '../common/app-error';
@Injectable()
export class AiDispatcher implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private stopping = false;
  private readonly logger = new Logger(AiDispatcher.name);
  constructor(
    private readonly db: DataSource,
    @InjectQueue(AI_QUEUE) private readonly queue: Queue,
    private readonly jobs: AiJobsService,
  ) {
    this.queue.on('error', () =>
      this.logger.warn('AI queue connection temporarily unavailable.'),
    );
  }
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 1000);
    void this.tick();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      const expired: StoredJob[] = await this.db.query(
        `SELECT * FROM ai_job WHERE status IN ('queued','running','retrying') AND expires_at<=now()`,
      );
      for (const job of expired)
        await this.jobs.fail(
          job.id,
          new AppError(
            'AI_JOB_EXPIRED',
            'Yêu cầu AI đã hết thời gian xử lý. Vui lòng thử lại.',
            408,
          ),
        );
      await this.db.query(
        'DELETE FROM practice_import_draft WHERE expires_at<now()',
      );
      await this.db.query(
        `DELETE FROM ai_job WHERE result_expires_at<now() AND status IN ('succeeded','failed')`,
      );
      const pending: StoredJob[] = await this.db.query(
        `SELECT j.* FROM ai_job j JOIN ai_job_dispatch d ON d.job_id=j.id WHERE j.status IN ('queued','running','retrying') ORDER BY j.created_at LIMIT 100`,
      );
      for (const row of pending) {
        let queued = await this.queue.getJob(row.id);
        if (!queued) {
          queued = await this.queue.add(
            'generate',
            { jobId: row.id },
            {
              jobId: row.id,
              attempts: 2,
              backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
              removeOnComplete: { age: 7 * 86400 },
              removeOnFail: { age: 7 * 86400 },
            },
          );
        } else {
          const state = await queued.getState();
          if (state === 'failed' || state === 'completed') {
            if (row.output || row.attempts < 2) {
              if (state === 'failed') await queued.retry();
              else {
                await queued.remove();
                await this.db.query(
                  'UPDATE ai_job_dispatch SET dispatched_at=NULL WHERE job_id=$1',
                  [row.id],
                );
              }
            } else
              await this.jobs.fail(
                row.id,
                AppError.aiUpstream(
                  'Không thể khôi phục yêu cầu AI. Vui lòng thử lại.',
                ),
              );
          }
        }
        await this.db.query(
          'UPDATE ai_job_dispatch SET dispatched_at=COALESCE(dispatched_at,now()) WHERE job_id=$1',
          [row.id],
        );
      }
    } catch {
      this.logger.warn(
        'AI queue temporarily unavailable; durable jobs remain pending.',
      );
    } finally {
      this.busy = false;
    }
  }
}
