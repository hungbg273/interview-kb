import { createHash } from 'node:crypto';
import { AppError } from '../common/app-error';
export const ACTIVE_STATES = ['queued', 'running', 'retrying'] as const;
export function isTerminal(state: string) {
  return state === 'succeeded' || state === 'failed';
}
export function sourceHash(title: string, body: string) {
  return createHash('sha256')
    .update(JSON.stringify([title, body]))
    .digest('hex');
}
export function canRetry(error: unknown) {
  return (
    error instanceof AppError &&
    ['AI_UPSTREAM', 'AI_TIMEOUT', 'CHATGPT_USAGE_UNAVAILABLE'].includes(
      error.code,
    )
  );
}
export function safeJobError(error: unknown) {
  if (error instanceof AppError) {
    const body = error.getResponse() as { error: { message: string } };
    return { code: error.code, message: body.error.message };
  }
  return {
    code: 'AI_JOB_FAILED',
    message: 'Không hoàn tất được yêu cầu AI. Vui lòng thử lại.',
  };
}
