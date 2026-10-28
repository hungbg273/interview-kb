import {
  BadRequestException,
  INestApplication,
  PayloadTooLargeException,
  ValidationPipe,
} from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { json, type NextFunction, type Request, type Response } from 'express';
import { setupSwagger } from './setup-swagger';

export function configureApp(app: INestApplication) {
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

  // Full multilingual transcript snapshots can exceed Nest's ordinary 100 KB
  // parser limit. Register this bounded route parser before app.init installs
  // Nest's default parser; all other routes retain the smaller default limit.
  const interviewJson = json({ limit: '1mb' });
  app.use('/interviews', (req: Request, res: Response, next: NextFunction) => {
    interviewJson(req, res, (error?: { status?: number }) => {
      if (!error) return next();
      next(
        error.status === 413
          ? new PayloadTooLargeException(
              'Interview request exceeds the 1 MB limit.',
            )
          : new BadRequestException('Invalid interview JSON request.'),
      );
    });
  });
  app.use(cookieParser());
  app.enableCors({ origin, credentials: true });
  // AppErrorFilter is registered globally via APP_FILTER in AppModule so it can
  // inject the pino logger; no need to attach it here.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  setupSwagger(app);
}
