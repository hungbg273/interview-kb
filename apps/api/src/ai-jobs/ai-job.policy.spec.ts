import { canRetry, isTerminal, sourceHash } from './ai-job.policy';
import { AppError } from '../common/app-error';
describe('AI job policy', () => {
  it('retries transient provider failures but not quota, identity or validation errors', () => {
    expect(canRetry(AppError.aiUpstream())).toBe(true);
    expect(canRetry(AppError.aiTimeout())).toBe(true);
    expect(canRetry(new AppError('CHATGPT_USAGE_LIMIT', 'limit', 429))).toBe(
      false,
    );
    expect(
      canRetry(new AppError('CHATGPT_RECONNECT_REQUIRED', 'login', 409)),
    ).toBe(false);
    expect(canRetry(AppError.validation('bad'))).toBe(false);
  });
  it('hashes content deterministically and detects changed source', () => {
    expect(sourceHash('Title', 'Body')).toBe(sourceHash('Title', 'Body'));
    expect(sourceHash('Title', 'Body')).not.toBe(sourceHash('Title', 'Edited'));
  });
  it('recognizes terminal states', () => {
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('retrying')).toBe(false);
  });
});
