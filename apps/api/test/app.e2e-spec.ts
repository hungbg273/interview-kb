import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';
import { Topic } from './../src/entities/topic.entity';

describe('API bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });


  afterEach(async () => {
    await app.close();
  });

  it('GET /health is public and returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ ok: true });
  });

  it('unknown route returns NOT_FOUND error shape', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at Object/i);
  });

  it('injects Topic repository from TypeORM', () => {
    const dataSource = app.get(DataSource);
    const repo = dataSource.getRepository(Topic);
    expect(repo.metadata.tableName).toBe('topic');
  });

  it('note has generated search_vector and no user table', async () => {
    const dataSource = app.get(DataSource);
    const columns: Array<{ data_type: string; is_generated: string }> =
      await dataSource.query(`
        SELECT data_type, is_generated
        FROM information_schema.columns
        WHERE table_name = 'note' AND column_name = 'search_vector'
      `);
    expect(columns[0]?.data_type).toBe('tsvector');
    expect(columns[0]?.is_generated).toBe('ALWAYS');

    const tables: Array<{ tablename: string }> = await dataSource.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'user'
    `);
    expect(tables).toHaveLength(0);
  });

  it('rejects note body longer than 100000 characters', async () => {
    const dataSource = app.get(DataSource);
    const constraints: Array<{ conname: string }> = await dataSource.query(`
      SELECT conname FROM pg_constraint
      WHERE conname = 'note_body_markdown_length'
    `);
    expect(constraints).toHaveLength(1);
  });

  it('GET /auth/me without cookie is 401 UNAUTHENTICATED', async () => {
    const res = await request(app.getHttpServer()).get('/auth/me').expect(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: expect.any(String) },
    });
  });

  it('GET /docs-json is public OpenAPI', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toEqual(expect.any(String));
    expect(res.body.paths['/health']).toBeDefined();
    expect(res.body.paths['/auth/me']).toBeDefined();
  });

  it('POST /topics without cookie is 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/topics')
      .send({ name: 'TCP' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('POST /notes/:id/ai without cookie is 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes/00000000-0000-0000-0000-000000000001/ai')
      .send({ action: 'summarize', provider: 'openai' })
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('OpenAPI documents POST /notes/{id}/ai', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.paths['/notes/{id}/ai']?.post).toBeDefined();
  });
});
