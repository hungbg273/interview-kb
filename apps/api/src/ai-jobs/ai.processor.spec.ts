import { AiProcessor } from './ai.processor';
import { AppError } from '../common/app-error';
describe('AI worker failure policy', () => {
  function setup(error: unknown) {
    const jobs = {
      begin: jest.fn().mockResolvedValue({
        id: 'job',
        attempts: 1,
        expires_at: new Date(Date.now() + 60000),
      }),
      generate: jest.fn().mockRejectedValue(error),
      finalize: jest.fn(),
      fail: jest.fn(),
    };
    return { jobs, processor: new AiProcessor(jobs as never) };
  }
  it('retries a transient failure once', async () => {
    const { jobs, processor } = setup(AppError.aiTimeout());
    await expect(
      processor.process({ data: { jobId: 'job' }, attemptsMade: 0 } as never),
    ).rejects.toThrow();
    expect(jobs.fail).toHaveBeenCalledWith('job', expect.anything(), true);
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
