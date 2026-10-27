import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  createDataSource,
  typeormOptions,
  migrations,
} from '../database/typeorm.config';
import { AccountsService } from '../accounts/accounts.service';
import { AccountInterceptor } from '../accounts/account.interceptor';
import { withAccount, Account } from '../accounts/account-context';
import { NotesRepository } from '../database/notes.repository';
import { TopicsRepository } from '../database/topics.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { TopicParentsRepository } from '../database/topic-parents.repository';
import { NoteTopicsRepository } from '../database/note-topics.repository';
import { NotesService } from '../notes/notes.service';
import { NotesController } from '../notes/notes.controller';
import { TopicsService } from '../topics/topics.service';
import { TopicsController } from '../topics/topics.controller';
import { QuestionsService } from '../questions/questions.service';
import { QuestionsController } from '../questions/questions.controller';
import { PracticeService } from '../practice/practice.service';
import { PracticeController } from '../practice/practice.controller';
import { PracticeImportService } from '../practice/practice-import.service';
import { SearchService } from '../search/search.service';
import { SearchController } from '../search/search.controller';
import { AiService } from '../ai/ai.service';
import { AiController } from '../ai/ai.controller';
import { AiJobsService } from '../ai-jobs/ai-jobs.service';
import { ChatgptConnection } from '../chatgpt/chatgpt.connection';
import { LlmClient } from '../ai/llm.client';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { AppErrorFilter } from '../common/app-error.filter';
const integration =
  process.env.RUN_LIBRARY_INTEGRATION === '1' ? describe : describe.skip;
integration('Personal libraries and community with PostgreSQL', () => {
  let admin: DataSource,
    db: DataSource,
    app: INestApplication,
    alice: Account,
    bob: Account;
  const name = 'library_test_' + randomUUID().replace(/-/g, '');
  const originalAllow = process.env.ADMIN_EMAILS,
    originalLegacy = process.env.LEGACY_OWNER_EMAIL;
  const llm = { complete: jest.fn().mockResolvedValue('AI result') };
  const call = (user: 'alice' | 'bob') => ({
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('x-test-user', user),
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set('x-test-user', user),
    patch: (url: string) =>
      request(app.getHttpServer()).patch(url).set('x-test-user', user),
    delete: (url: string) =>
      request(app.getHttpServer()).delete(url).set('x-test-user', user),
    put: (url: string) =>
      request(app.getHttpServer()).put(url).set('x-test-user', user),
  });
  beforeAll(async () => {
    admin = createDataSource();
    await admin.initialize();
    await admin.query('CREATE DATABASE ' + name);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = '/' + name;
    db = new DataSource({
      ...typeormOptions(),
      url: url.href,
      migrations: migrations.slice(0, -1),
    } as never);
    await db.initialize();
    await db.runMigrations();
    await db.query(
      "INSERT INTO note(title,body_markdown) VALUES('Legacy note','Legacy private body')",
    );
    await db.query(
      "INSERT INTO topic(name,slug) VALUES('Legacy topic','legacy')",
    );
    await db.destroy();
    process.env.LEGACY_OWNER_EMAIL = 'alice@example.invalid';
    process.env.ADMIN_EMAILS = 'alice@example.invalid,bob@example.invalid';
    db = new DataSource({ ...typeormOptions(), url: url.href } as never);
    await db.initialize();
    await db.runMigrations();
    const accounts = new AccountsService(db);
    alice = await accounts.ensure('alice@example.invalid', 'Alice');
    bob = await accounts.ensure('bob@example.invalid', 'Bob');
    const module = await Test.createTestingModule({
      controllers: [
        NotesController,
        TopicsController,
        QuestionsController,
        PracticeController,
        SearchController,
        AiController,
        CommunityController,
      ],
      providers: [
        { provide: DataSource, useValue: db },
        AccountsService,
        NotesRepository,
        TopicsRepository,
        QuestionsRepository,
        NoteTopicsRepository,
        TopicParentsRepository,
        NotesService,
        TopicsService,
        QuestionsService,
        PracticeService,
        SearchService,
        AiService,
        CommunityService,
        AiJobsService,
        { provide: LlmClient, useValue: llm },
        {
          provide: ChatgptConnection,
          useValue: {
            binding: async () => ({ identity: 'test', model: 'test' }),
          },
        },
        { provide: PracticeImportService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, res: any, next: () => void) => {
      const account = req.headers['x-test-user'] === 'bob' ? bob : alice;
      req.user = { email: account.email };
      next();
    });
    app.useGlobalInterceptors(new AccountInterceptor(accounts));
    app.useGlobalFilters(new AppErrorFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      await admin.query('DROP DATABASE IF EXISTS ' + name);
      await admin.destroy();
    }
    process.env.ADMIN_EMAILS = originalAllow;
    process.env.LEGACY_OWNER_EMAIL = originalLegacy;
  });
  it('migrates existing data to the explicit owner, private by default', async () => {
    const a = await call('alice').get('/notes').expect(200),
      b = await call('bob').get('/notes').expect(200);
    expect(a.body.items.some((n: any) => n.title === 'Legacy note')).toBe(true);
    expect(b.body.items).toEqual([]);
    expect(
      (await call('bob').get('/community/notes').expect(200)).body.items,
    ).toEqual([]);
  });
  it('isolates notes, topics, search, questions, practice and synchronous/background AI', async () => {
    const topic = (
      await call('alice')
        .post('/topics')
        .send({ name: 'Private secret subject' })
        .expect(201)
    ).body;
    const note = (
      await call('alice')
        .post('/notes')
        .send({
          title: 'Secret personal note',
          bodyMarkdown: 'Private body',
          topicIds: [topic.id],
        })
        .expect(201)
    ).body;
    await call('bob')
      .get('/notes/' + note.id)
      .expect(404);
    await call('bob')
      .patch('/notes/' + note.id)
      .send({ bodyMarkdown: 'Attack' })
      .expect(404);
    await call('bob')
      .delete('/notes/' + note.id)
      .expect(404);
    await call('bob')
      .get('/topics/' + topic.id)
      .expect(404);
    const own = (
      await call('bob')
        .post('/notes')
        .send({ title: 'Bob note', bodyMarkdown: 'Own' })
        .expect(201)
    ).body;
    await call('bob')
      .put(`/notes/${own.id}/topics`)
      .send({ topicIds: [topic.id] })
      .expect(400);
    const ownTopic = (
      await call('bob')
        .post('/topics')
        .send({ name: 'Private secret subject' })
        .expect(201)
    ).body;
    await call('bob')
      .post(`/topics/${ownTopic.id}/parents`)
      .send({ parentId: topic.id })
      .expect(404);
    const search = (await call('bob').get('/search?q=Secret').expect(200)).body;
    expect(search.notes).toEqual([]);
    const question = (
      await call('alice')
        .post(`/notes/${note.id}/questions`)
        .send({
          prompt: 'Secret?',
          choiceA: 'a',
          choiceB: 'b',
          choiceC: 'c',
          choiceD: 'd',
          correctChoice: 'A',
          lang: 'vi',
        })
        .expect(201)
    ).body;
    await call('bob')
      .patch('/questions/' + question.id)
      .send({ prompt: 'Attack?' })
      .expect(404);
    await call('bob')
      .post('/practice/grade')
      .send({ answers: [{ questionId: question.id, choice: 'A' }] })
      .expect(400);
    await call('bob')
      .get(`/practice/questions?noteId=${note.id}&lang=vi`)
      .expect(404);
    await call('bob')
      .post(`/notes/${note.id}/ai`)
      .send({ action: 'summarize', provider: 'chatgpt' })
      .expect(404);
    const jobs = app.get(AiJobsService);
    await expect(
      withAccount(bob, () =>
        jobs.create(
          bob.email,
          note.id,
          { action: 'summarize', provider: 'chatgpt' },
          randomUUID(),
        ),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(llm.complete).not.toHaveBeenCalled();
  });
  it('publishes snapshots and creates idempotent, independent private clones', async () => {
    const note = (
      await call('alice')
        .post('/notes')
        .send({ title: 'Public article', bodyMarkdown: '# Version 1' })
        .expect(201)
    ).body;
    await call('bob')
      .post(`/notes/${note.id}/publication`)
      .send({})
      .expect(404);
    const publication = (
      await call('alice')
        .post(`/notes/${note.id}/publication`)
        .send({})
        .expect(201)
    ).body;
    expect(
      (await call('bob').get('/community/notes').expect(200)).body.items[0].id,
    ).toBe(publication.id);
    await call('alice')
      .patch('/notes/' + note.id)
      .send({ bodyMarkdown: '# Private draft 2' })
      .expect(200);
    expect(
      (
        await call('bob')
          .get('/community/notes/' + publication.id)
          .expect(200)
      ).body.bodyMarkdown,
    ).toBe('# Version 1');
    const topic = (
      await call('bob')
        .post('/topics')
        .send({ name: 'My collection' })
        .expect(201)
    ).body;
    const [one, two] = await Promise.all([
      call('bob')
        .post(`/community/notes/${publication.id}/clone`)
        .send({ topicId: topic.id })
        .expect(201),
      call('bob')
        .post(`/community/notes/${publication.id}/clone`)
        .send({ topicId: topic.id })
        .expect(201),
    ]);
    expect(one.body.id).toBe(two.body.id);
    const clone = (
      await call('bob')
        .get('/notes/' + one.body.id)
        .expect(200)
    ).body;
    expect(clone.bodyMarkdown).toBe('# Version 1');
    expect(clone.sourcePublication.author).toBe('Alice');
    expect(clone.topicIds).toEqual([topic.id]);
    expect(
      (await call('bob').get(`/notes/${clone.id}/publication`).expect(200)).body
        .published,
    ).toBe(false);
    await call('alice')
      .get('/notes/' + clone.id)
      .expect(404);
    await call('alice')
      .post(`/notes/${note.id}/publication`)
      .send({})
      .expect(201);
    expect(
      (
        await call('bob')
          .get('/community/notes/' + publication.id)
          .expect(200)
      ).body.bodyMarkdown,
    ).toBe('# Private draft 2');
    expect(
      (
        await call('bob')
          .get('/notes/' + clone.id)
          .expect(200)
      ).body.bodyMarkdown,
    ).toBe('# Version 1');
    await call('alice').delete(`/notes/${note.id}/publication`).expect(200);
    await call('bob')
      .get('/community/notes/' + publication.id)
      .expect(404);
    await call('bob')
      .post(`/community/notes/${publication.id}/clone`)
      .send({})
      .expect(404);
    expect(
      (
        await call('bob')
          .get('/notes/' + clone.id)
          .expect(200)
      ).body.bodyMarkdown,
    ).toBe('# Version 1');
  });
  it('keeps worker-created questions private and blocks foreign job results/application', async () => {
    const note = (
      await call('alice')
        .post('/notes')
        .send({ title: 'Worker note', bodyMarkdown: 'Worker private body' })
        .expect(201)
    ).body;
    const jobs = app.get(AiJobsService);
    const question = {
      prompt: 'Private AI question?',
      choiceA: 'a',
      choiceB: 'b',
      choiceC: 'c',
      choiceD: 'd',
      correctChoice: 'A',
    };
    llm.complete.mockResolvedValueOnce(JSON.stringify({ items: [question] }));
    const job = await jobs.create(
      alice.email,
      note.id,
      { action: 'generate-questions', provider: 'chatgpt', targetLang: 'vi' },
      randomUUID(),
    );
    const row = await jobs.begin(job.id);
    expect(row).toBeTruthy();
    await jobs.generate(row!);
    await jobs.finalize(job.id);
    const [saved] = await db.query(
      'SELECT user_id FROM question WHERE note_id=$1',
      [note.id],
    );
    expect(saved.user_id).toBe(alice.id);
    await expect(jobs.result(bob.email, job.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(jobs.apply(bob.email, job.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      (
        await call('bob')
          .get(`/practice/questions?noteId=${note.id}&lang=vi`)
          .expect(404)
      ).body.error.code,
    ).toBe('NOT_FOUND');
  });
  it('rejects cross-account relation writes at the database boundary', async () => {
    const [a] = await db.query('SELECT id FROM note WHERE user_id=$1 LIMIT 1', [
      alice.id,
    ]);
    const [b] = await db.query(
      'SELECT id FROM topic WHERE user_id=$1 LIMIT 1',
      [bob.id],
    );
    await expect(
      db.query('INSERT INTO note_topic(note_id,topic_id) VALUES($1,$2)', [
        a.id,
        b.id,
      ]),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
  });
});
