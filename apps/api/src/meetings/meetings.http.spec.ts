import { Test } from '@nestjs/testing';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { configureApp } from '../configure-app';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { AccountsService } from '../accounts/accounts.service';
import { AccountInterceptor } from '../accounts/account.interceptor';
import { MeetingsModule } from './meetings.module';
import { LlmClient } from '../ai/llm.client';

function wav() {
  const b = Buffer.alloc(32044);
  b.write('RIFF');
  b.writeUInt32LE(32036, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24);
  b.writeUInt32LE(32000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(32000, 40);
  return b;
}
describe('Meeting HTTP API', () => {
  const env = { ...process.env };
  const originalFetch = global.fetch;
  let app: INestApplication;
  let cookie: string;
  const complete = jest.fn().mockResolvedValue('Xin chào');
  const setup = {
    provider: 'openai',
    sourceLang: 'en',
    targetLang: 'vi',
    context: { personal: 'Engineer' },
  };
  beforeAll(async () => {
    process.env.JWT_SECRET = 'meeting-http-test-secret';
    process.env.ADMIN_EMAILS = 'alice@example.test,bob@example.test';
    process.env.OPENAI_API_KEY = 'test-key';
    const module = await Test.createTestingModule({
      imports: [
        MeetingsModule,
        PassportModule,
        JwtModule.register({ secret: process.env.JWT_SECRET }),
      ],
      providers: [
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_INTERCEPTOR, useClass: AccountInterceptor },
        {
          provide: AccountsService,
          useValue: {
            ensure: async (email: string) => ({
              id: email,
              email,
              displayName: email,
            }),
          },
        },
      ],
    })
      .overrideProvider(LlmClient)
      .useValue({ complete })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
    cookie = `kb_access_token=${module.get(JwtService).sign({ sub: 'alice', email: 'alice@example.test' })}`;
  });
  afterAll(async () => {
    await app?.close();
    process.env = { ...env };
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('{"text":"Hello"}'));
  });
  it('requires real cookie JWT authentication', async () => {
    await request(app.getHttpServer())
      .post('/meetings')
      .send(setup)
      .expect(401);
    await request(app.getHttpServer())
      .post('/meetings')
      .set('Cookie', 'kb_access_token=invalid')
      .send(setup)
      .expect(401);
  });
  it('validates context and rejects null/unknown/oversized data', async () => {
    for (const context of [
      [{ personal: 'array bypass' }],
      null,
      { personal: null },
      { secret: 'unknown' },
      { personal: 'x'.repeat(4001) },
    ])
      await request(app.getHttpServer())
        .post('/meetings')
        .set('Cookie', cookie)
        .send({ ...setup, context })
        .expect(400);
  });
  it('runs audio -> translation -> suggestions -> stop and rejects bad audio before paid calls', async () => {
    const started = await request(app.getHttpServer())
      .post('/meetings')
      .set('Cookie', cookie)
      .send(setup)
      .expect(201);
    const root = `/meetings/${started.body.id}`;
    expect(started.headers['cache-control']).toBe('no-store');
    await request(app.getHttpServer())
      .patch(`${root}/context`)
      .set('Cookie', cookie)
      .send([{ personal: 'invalid' }])
      .expect(400);
    await request(app.getHttpServer())
      .post(`${root}/audio`)
      .set('Cookie', cookie)
      .field('sequence', '0')
      .attach('file', Buffer.from('bad'), 'audio.wav')
      .expect(400);
    await request(app.getHttpServer())
      .post(`${root}/audio`)
      .set('Cookie', cookie)
      .field('sequence', '-1')
      .attach('file', wav(), 'audio.wav')
      .expect(400);
    await request(app.getHttpServer())
      .post(`${root}/audio`)
      .set('Cookie', cookie)
      .attach('file', wav(), 'audio.wav')
      .expect(400);
    await request(app.getHttpServer())
      .post(`${root}/audio`)
      .set('Cookie', cookie)
      .field('sequence', '0')
      .attach('file', Buffer.alloc(320045), 'audio.wav')
      .expect(413);
    expect(global.fetch).not.toHaveBeenCalled();
    const segment = await request(app.getHttpServer())
      .post(`${root}/audio`)
      .set('Cookie', cookie)
      .field('sequence', '0')
      .attach('file', wav(), 'audio.wav')
      .expect(200);
    expect(segment.body).toEqual({
      sequence: 0,
      text: 'Hello',
      translation: 'Xin chào',
    });
    await request(app.getHttpServer())
      .post(`${root}/audio`)
      .set('Cookie', cookie)
      .field('sequence', '0')
      .attach('file', wav(), 'audio.wav')
      .expect(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    complete.mockResolvedValueOnce(
      '{"reply":"Let me check.","explanation":"Cần xác nhận."}',
    );
    const reply = await request(app.getHttpServer())
      .post(`${root}/suggestions`)
      .set('Cookie', cookie)
      .send({ draft: 'Tôi kiểm tra lại' })
      .expect(200);
    expect(reply.body.reply).toBe('Let me check.');
    await request(app.getHttpServer())
      .patch(`${root}/context`)
      .set('Cookie', cookie)
      .send({ meeting: 'New notes' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`${root}/stop`)
      .set('Cookie', cookie)
      .expect(200);
    await request(app.getHttpServer())
      .get(root)
      .set('Cookie', cookie)
      .expect(404);
  });
  it('accepts caption text without speech credentials and validates text before AI', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'test';
    const started = await request(app.getHttpServer())
      .post('/meetings')
      .set('Cookie', cookie)
      .send({ ...setup, provider: 'deepseek', inputMode: 'captions' })
      .expect(201);
    const root = `/meetings/${started.body.id}`;
    for (const text of ['', '   ', 'x'.repeat(4001), null])
      await request(app.getHttpServer())
        .post(`${root}/captions`)
        .set('Cookie', cookie)
        .send({ sequence: 0, utteranceId: 'caption-1', text })
        .expect(400);
    const result = await request(app.getHttpServer())
      .post(`${root}/captions`)
      .set('Cookie', cookie)
      .send({
        sequence: 0,
        utteranceId: 'caption-1',
        text: 'Hello',
        speaker: 'Alice',
      })
      .expect(200);
    expect(result.body).toMatchObject({
      text: 'Hello',
      translation: 'Xin chào',
      speaker: 'Alice',
    });
    expect(global.fetch).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post(`${root}/stop`)
      .set('Cookie', cookie)
      .expect(200);
  });
});
