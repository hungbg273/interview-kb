import { AiProcessor } from './ai.processor';
import { AppError } from '../common/app-error';
import { Logger } from '@nestjs/common';
describe('AI worker failure policy', () => {
  afterEach(() => jest.restoreAllMocks());
  function setup(error: unknown) {
    const jobs = {
      begin: jest.fn().mockResolvedValue({
        id: 'job',
        attempts: 1,
        action: 'generate-content',
        provider: 'deepseek',
        expires_at: new Date(Date.now() + 60000),
      }),
      generate: jest.fn().mockRejectedValue(error),
      finalize: jest.fn(),
      fail: jest.fn(),
    };
    return { jobs, processor: new AiProcessor(jobs as never) };
  }
  it('retries a transient failure once', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const { jobs, processor } = setup(AppError.aiTimeout());
    await expect(
      processor.process({ data: { jobId: 'job' }, attemptsMade: 0 } as never),
    ).rejects.toThrow();
    expect(jobs.fail).toHaveBeenCalledWith('job', expect.anything(), true);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({
      jobId: 'job',
      provider: 'deepseek',
      attempt: 1,
      status: 'retrying',
      errorCode: 'AI_TIMEOUT',
    });
  });
  it('logs a terminal error without exposing its raw contents', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const { jobs, processor } = setup(new Error('secret-content-and-key'));
    await expect(
      processor.process({ data: { jobId: 'job' }, attemptsMade: 1 } as never),
    ).rejects.toThrow();
    expect(jobs.fail).toHaveBeenCalledWith('job', expect.anything(), false);
    const log = warn.mock.calls[0][0];
    expect(JSON.parse(log)).toMatchObject({
      status: 'failed',
      errorCode: 'AI_JOB_FAILED',
    });
    expect(log).not.toContain('secret-content-and-key');
  });
  it('never retries plan exhaustion', async () => {
    const { jobs, processor } = setup(
      new AppError('CHATGPT_USAGE_LIMIT', 'limit', 429),
    );
    await expect(
      processor.process({ data: { jobId: 'job' }, attemptsMade: 0 } as never),
    ).rejects.toThrow();
    expect(jobs.fail).toHaveBeenCalledWith('job', expect.anything(), false);
  });
  it('skips completed work', async () => {
    const { jobs, processor } = setup(null);
    jobs.begin.mockResolvedValue(null);
    await processor.process({ data: { jobId: 'job' } } as never);
    expect(jobs.generate).not.toHaveBeenCalled();
  });
});
