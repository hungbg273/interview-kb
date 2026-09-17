import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppErrorFilter } from './common/app-error.filter';
import { setupSwagger } from './setup-swagger';

export function configureApp(app: INestApplication) {
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

  app.use(cookieParser());
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new AppErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  setupSwagger(app);
}
