import { Test } from '@nestjs/testing';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import { configureApp } from '../configure-app';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AccountInterceptor } from '../accounts/account.interceptor';
import { AccountsService } from '../accounts/accounts.service';
import { NoteImagesController } from './note-images.controller';
import { NoteImagesService } from './note-images.service';
import { NoteImagesRepository } from '../database/note-images.repository';

describe('note image HTTP contract', () => {
  const oldEnv = { ...process.env };
  let app: INestApplication, cookie: string, png: Buffer;
  const id = '12345678-1234-4234-8234-123456789abc';
  const readable = jest.fn();
  beforeAll(async () => {
    process.env.JWT_SECRET = 'image-test-secret';
    process.env.ADMIN_EMAILS = 'image@example.test';
    png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET }),
      ],
      controllers: [NoteImagesController],
      providers: [
        NoteImagesService,
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_INTERCEPTOR, useClass: AccountInterceptor },
        {
          provide: AccountsService,
          useValue: {
            ensure: async (email: string) => ({
              id,
              email,
              displayName: email,
            }),
          },
        },
        {
          provide: NoteImagesRepository,
          useValue: {
            save: async (value: unknown) => ({ ...(value as object), id }),
            readable,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    cookie = `kb_access_token=${module.get(JwtService).sign({ sub: 'image', email: 'image@example.test' })}`;
  });
  afterAll(async () => {
    await app?.close();
    process.env = { ...oldEnv };
  });
  it('requires authentication for both uploading and reading', async () => {
    await request(app.getHttpServer())
      .post('/note-images')
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/note-images/' + id)
      .expect(401);
  });
  it('uploads a real image and returns only a portable reference', async () => {
    const result = await request(app.getHttpServer())
      .post('/note-images')
      .set('Cookie', cookie)
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    expect(result.body).toEqual({
      id,
      url: '/note-images/' + id,
      width: 2,
      height: 2,
    });
  });
  it('rejects oversized multipart bodies', async () => {
    await request(app.getHttpServer())
      .post('/note-images')
      .set('Cookie', cookie)
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
  });
  it('returns bytes with private noncacheable headers and checks missing access', async () => {
    readable.mockResolvedValue({ data: png, mimeType: 'image/png' });
    const result = await request(app.getHttpServer())
      .get('/note-images/' + id)
      .set('Cookie', cookie)
      .expect(200);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.headers['content-type']).toContain('image/png');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
    readable.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/note-images/' + id)
      .set('Cookie', cookie)
      .expect(404);
  });
});
