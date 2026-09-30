import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

  function cookie() {
    const allow = process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || 'you@example.com';
    process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || allow;
    const token = app.get(JwtService).sign({ sub: allow, email: allow });
    return `kb_access_token=${token}`;
  }

  it('GET /auth/me with JWT cookie returns the email', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie())
      .expect(200);
    expect(res.body.email).toEqual(expect.any(String));
  });

  it('note CRUD rejects invalid ABCD and unknown ids', async () => {
    const auth = cookie();
    const http = request(app.getHttpServer());
    const created = await http
      .post('/notes')
      .set('Cookie', auth)
      .send({ title: `TCP ${Date.now()}`, bodyMarkdown: 'reliable' })
      .expect(201);
    const id = created.body.id as string;

    await http.get(`/notes/${id}`).set('Cookie', auth).expect(200);

    await http
      .post(`/notes/${id}/questions`)
      .set('Cookie', auth)
      .send({
        prompt: 'Q',
        choiceA: 'a',
        choiceB: 'b',
        choiceC: 'c',
        choiceD: 'd',
        correctChoice: 'E',
      })
      .expect(400);

    await http
      .get('/notes/00000000-0000-0000-0000-000000000000')
      .set('Cookie', auth)
      .expect(404);

    await http.delete(`/notes/${id}`).set('Cookie', auth).expect(204);
  });

  it('409 duplicate topic slug', async () => {
    const auth = cookie();
    const name = `UniqueTopic${Date.now()}`;
    const http = request(app.getHttpServer());
    await http.post('/topics').set('Cookie', auth).send({ name }).expect(201);
    await http.post('/topics').set('Cookie', auth).send({ name }).expect(409);
  });

  it('subject graph: two parents, exact notes, search, uncategorized, cycle, delete detaches', async () => {
    const auth = cookie();
    const http = request(app.getHttpServer());
    const suffix = Date.now();
    const networking = await http
      .post('/topics')
      .set('Cookie', auth)
      .send({ name: `Networking${suffix}` })
      .expect(201);
    const interview = await http
      .post('/topics')
      .set('Cookie', auth)
      .send({ name: `Interview${suffix}` })
      .expect(201);
    const tcp = await http
      .post('/topics')
      .set('Cookie', auth)
      .send({
        name: `TCP${suffix}`,
        parentIds: [networking.body.id],
      })
      .expect(201);

    await http
      .post(`/topics/${tcp.body.id}/parents`)
      .set('Cookie', auth)
      .send({ parentId: interview.body.id })
      .expect(201);

    await http
      .post(`/topics/${networking.body.id}/parents`)
      .set('Cookie', auth)
      .send({ parentId: tcp.body.id })
      .expect(409)
      .expect((res) => {
        expect(res.body.error.code).toBe('CYCLE');
      });

    const tcpNote = await http
      .post('/notes')
      .set('Cookie', auth)
      .send({
        title: `Handshake ${suffix}`,
        bodyMarkdown: 'syn',
        topicIds: [tcp.body.id, networking.body.id],
      })
      .expect(201);
    expect(tcpNote.body.topicIds).toEqual(
      expect.arrayContaining([tcp.body.id, networking.body.id]),
    );

    const loose = await http
      .post('/notes')
      .set('Cookie', auth)
      .send({ title: `Loose ${suffix}`, bodyMarkdown: 'none' })
      .expect(201);

    const onTcp = await http
      .get(`/notes?topicId=${tcp.body.id}`)
      .set('Cookie', auth)
      .expect(200);
    expect(onTcp.body.items.map((n: { id: string }) => n.id)).toContain(tcpNote.body.id);
    expect(onTcp.body.items.map((n: { id: string }) => n.id)).not.toContain(loose.body.id);

    const onNet = await http
      .get(`/notes?topicId=${networking.body.id}`)
      .set('Cookie', auth)
      .expect(200);
    expect(onNet.body.items.map((n: { id: string }) => n.id)).toContain(tcpNote.body.id);

    const uncategorized = await http
      .get('/notes?uncategorized=1')
      .set('Cookie', auth)
      .expect(200);
    expect(uncategorized.body.items.map((n: { id: string }) => n.id)).toContain(
      loose.body.id,
    );
    expect(uncategorized.body.items.map((n: { id: string }) => n.id)).not.toContain(
      tcpNote.body.id,
    );

    const found = await http
      .get(`/search?q=TCP${suffix}`)
      .set('Cookie', auth)
      .expect(200);
    expect(found.body.topics.map((t: { name: string }) => t.name)).toContain(`TCP${suffix}`);
    expect(found.body.notes).toEqual([]);

    const byTitle = await http
      .get(`/search?q=Handshake%20${suffix}`)
      .set('Cookie', auth)
      .expect(200);
    expect(byTitle.body.notes.map((n: { title: string }) => n.title)).toContain(
      `Handshake ${suffix}`,
    );

    await http.delete(`/topics/${tcp.body.id}`).set('Cookie', auth).expect(204);

    const stillNote = await http
      .get(`/notes/${tcpNote.body.id}`)
      .set('Cookie', auth)
      .expect(200);
    expect(stillNote.body.topicIds).not.toContain(tcp.body.id);

    const roots = await http.get('/topics').set('Cookie', auth).expect(200);
    const rootIds = roots.body.map((t: { id: string }) => t.id);
    expect(rootIds).toContain(networking.body.id);
    expect(rootIds).toContain(interview.body.id);
  });

  it('practice quiz hides answers then grades', async () => {
    const auth = cookie();
    const http = request(app.getHttpServer());
    const note = await http
      .post('/notes')
      .set('Cookie', auth)
      .send({ title: `Quiz ${Date.now()}`, bodyMarkdown: 'tcp' })
      .expect(201);
    const q = await http
      .post(`/notes/${note.body.id}/questions`)
      .set('Cookie', auth)
      .send({
        prompt: 'SYN is first?',
        choiceA: 'yes',
        choiceB: 'no',
        choiceC: 'maybe',
        choiceD: 'never',
        correctChoice: 'A',
        explanationMarkdown: 'three way',
        lang: 'en',
      })
      .expect(201);

    const quiz = await http
      .get(`/practice/questions?noteId=${note.body.id}&limit=10&lang=en`)
      .set('Cookie', auth)
      .expect(200);
    expect(quiz.body.items).toHaveLength(1);
    expect(quiz.body.items[0].id).toBe(q.body.id);
    expect(quiz.body.items[0].correctChoice).toBeUndefined();
    expect(quiz.body.items[0].explanationMarkdown).toBeUndefined();

    const noneVi = await http
      .get(`/practice/questions?noteId=${note.body.id}&limit=10&lang=vi`)
      .set('Cookie', auth)
      .expect(200);
    expect(noneVi.body.items).toHaveLength(0);

    const graded = await http
      .post('/practice/grade')
      .set('Cookie', auth)
      .send({ answers: [{ questionId: q.body.id, choice: 'B' }] })
      .expect(200);
    expect(graded.body).toMatchObject({
      total: 1,
      correct: 0,
      items: [
        {
          questionId: q.body.id,
          choice: 'B',
          correctChoice: 'A',
          ok: false,
        },
      ],
    });
  });
});
