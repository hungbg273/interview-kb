import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ERROR_CODES } from '@kb/shared';
import { AppError } from './app-error';

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message = this.messageFrom(raw, exception);

      const code =
        status === HttpStatus.UNAUTHORIZED
          ? ERROR_CODES.UNAUTHENTICATED
          : status === HttpStatus.FORBIDDEN
            ? ERROR_CODES.FORBIDDEN
            : status === HttpStatus.NOT_FOUND
              ? ERROR_CODES.NOT_FOUND
              : status === HttpStatus.CONFLICT
                ? ERROR_CODES.CONFLICT
                : ERROR_CODES.VALIDATION;

      return res.status(status).json({ error: { code, message } });
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
  }

  private messageFrom(raw: string | object, exception: HttpException): string {
    if (typeof raw === 'string') return raw;
    const body = raw as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('; ');
    if (typeof body.message === 'string') return body.message;
    return exception.message;
  }
}
