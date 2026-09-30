import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, ErrorCode } from '@kb/shared';

export class AppError extends HttpException {
  readonly code: ErrorCode | string;

  constructor(code: ErrorCode | string, message: string, status: HttpStatus) {
    super({ error: { code, message } }, status);
    this.code = code;
  }

  static validation(message: string) {
    return new AppError(ERROR_CODES.VALIDATION, message, HttpStatus.BAD_REQUEST);
  }

  static notFound(message = 'Not found') {
    return new AppError(ERROR_CODES.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string) {
    return new AppError(ERROR_CODES.CONFLICT, message, HttpStatus.CONFLICT);
  }

  static cycle(message = 'Parent edge would create a cycle') {
    return new AppError(ERROR_CODES.CYCLE, message, HttpStatus.CONFLICT);
  }

  static unauthenticated(message = 'Unauthenticated') {
    return new AppError(
      ERROR_CODES.UNAUTHENTICATED,
      message,
      HttpStatus.UNAUTHORIZED,
    );
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static aiNotConfigured(message = 'API key missing for provider') {
    return new AppError(
      ERROR_CODES.AI_NOT_CONFIGURED,
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  static aiTimeout(message = 'AI request timed out') {
    return new AppError(
      ERROR_CODES.AI_TIMEOUT,
      message,
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }

  static aiUpstream(message = 'Provider error') {
    return new AppError(ERROR_CODES.AI_UPSTREAM, message, HttpStatus.BAD_GATEWAY);
  }
}
