import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { Logger } from '@nestjs/common';
import { AI_QUEUE, redisConnection } from './ai-queue';
import { AiJobsService } from './ai-jobs.service';
import { canRetry, safeJobError } from './ai-job.policy';
@Processor(AI_QUEUE, {
  concurrency: 1,
  connection: redisConnection(),
  drainDelay: 60,
  stalledInterval: 60_000,
})
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);
  constructor(private readonly jobs: AiJobsService) {
    super();
  }
  @OnWorkerEvent('error') onError() {
    this.logger.warn('AI worker connection temporarily unavailable.');
  }
  async process(job: Job<{ jobId: string }>) {
    const started = Date.now();
    const row = await this.jobs.begin(job.data.jobId);
    if (!row) return;
    try {
      if (!row.output && (await this.jobs.generate(row)) === false) return;
      await this.jobs.finalize(row.id);
      this.logger.log(
        JSON.stringify({
          jobId: row.id,
          action: row.action,
          provider: row.provider,
          durationMs: Date.now() - started,
          status: 'succeeded',
        }),
      );
    } catch (error) {
      const retry =
        canRetry(error) &&
        job.attemptsMade < 1 &&
        row.attempts < 2 &&
        new Date(row.expires_at).getTime() > Date.now() + 10000;
      await this.jobs.fail(row.id, error, retry);
      this.logger.warn(
        JSON.stringify({
          jobId: row.id,
          action: row.action,
          provider: row.provider,
          attempt: row.attempts,
          durationMs: Date.now() - started,
          status: retry ? 'retrying' : 'failed',
          errorCode: safeJobError(error).code,
        }),
      );
      if (retry) throw new Error('Transient AI failure');
      throw new UnrecoverableError('AI job failed');
    }
  }
}
