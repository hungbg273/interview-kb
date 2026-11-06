import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ChatgptConnection } from './chatgpt.connection';
import { ChatgptController } from './chatgpt.controller';
import { AppErrorFilter } from '../common/app-error.filter';

describe('hosted ChatGPT HTTP handoff', () => {
  let app: INestApplication;
  beforeAll(async () => {
    jest.replaceProperty(process, 'env', {
      ...process.env,
      WEB_ORIGIN: 'https://app.interviewbase.site',
      CHATGPT_REDIRECT_URI: 'http://127.0.0.1:4000/chatgpt/callback',
    });
    const connection = new ChatgptConnection({
      read: async () => null,
      hostId: async () => 'urn:uuid:server',
    } as never);
    const module = await Test.createTestingModule({
      controllers: [ChatgptController],
      providers: [{ provide: ChatgptConnection, useValue: connection }],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.use((req: any, _res: any, next: () => void) => {
      req.user = { email: 'owner@example.com' };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(
      new AppErrorFilter({ setContext: jest.fn(), error: jest.fn() } as never),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  it('returns a loopback handoff and requires its cookie on the callback', async () => {
    const start = await request(app.getHttpServer())
      .post('/chatgpt/connect')
      .send({ returnPath: '/notes/example', loopbackPort: 36039 })
      .expect(201);
    const handoff = new URL(start.body.url);
    expect(handoff.origin).toBe('http://127.0.0.1:36039');
    const auth = await request(app.getHttpServer())
      .get(handoff.pathname + handoff.search)
      .set('Host', handoff.host)
      .expect(302);
    const params = new URL(auth.headers.location).searchParams;
    expect(params.get('redirect_uri')).toBe(
      'http://127.0.0.1:36039/chatgpt/callback',
    );
    expect(auth.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(auth.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect(auth.headers['cache-control']).toBe('no-store');
    const state = params.get('state')!;
    await request(app.getHttpServer())
      .get('/chatgpt/callback')
      .query({ state, error: 'access_denied' })
      .set('Host', handoff.host)
      .expect(409);
    const cookie = auth.headers['set-cookie'][0].split(';')[0];
    const finish = await request(app.getHttpServer())
      .get('/chatgpt/callback')
      .query({ state, error: 'access_denied' })
      .set('Host', handoff.host)
      .set('Cookie', cookie)
      .expect(302);
    expect(finish.headers.location).toBe(
      'https://app.interviewbase.site/notes/example?chatgpt=error',
    );
    await request(app.getHttpServer())
      .get('/chatgpt/callback')
      .query({ state, error: 'access_denied' })
      .set('Host', handoff.host)
      .set('Cookie', cookie)
      .expect(409);
  });

  it.each([
    '/chatgpt/authorize?ticket=unused',
    '/chatgpt/callback?state=unused',
  ])('rejects a public-host OAuth endpoint %s', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set('Host', 'api.interviewbase.site')
      .expect(400);
  });

  it.each([80, 65536, 4000.5, '4000'])(
    'rejects malformed port %s at the HTTP boundary',
    async (loopbackPort) => {
      await request(app.getHttpServer())
        .post('/chatgpt/connect')
        .send({ returnPath: '/', loopbackPort })
        .expect(400);
    },
  );
});
