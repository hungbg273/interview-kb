import { Account, withAccount } from '../accounts/account-context';
import { AccountsService } from '../accounts/accounts.service';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AiJobsController } from './ai-jobs.controller';
import { AppErrorFilter } from '../common/app-error.filter';
import { PracticeImportService } from '../practice/practice-import.service';
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { DataSource } from 'typeorm';
import { createDataSource, typeormOptions } from '../database/typeorm.config';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { Note } from '../entities/note.entity';
import { Question } from '../entities/question.entity';
import { AiService } from '../ai/ai.service';
import { AiJobsService } from './ai-jobs.service';
import { AiDispatcher } from './ai-dispatcher.service';
import { AiProcessor } from './ai.processor';
import { redisConnection } from './ai-queue';

const integration =
  process.env.RUN_AI_JOBS_INTEGRATION === '1' ? describe : describe.skip;
integration('AI jobs with real PostgreSQL and Redis, mocked AI only', () => {
  let db: DataSource,
    queue: Queue,
    worker: Worker | undefined,
    jobs: AiJobsService,
    dispatcher: AiDispatcher;
  let owner: string, note: Note;
  let account: Account;
  const scenario = (name: string, work: () => Promise<void>) =>
    it(name, () => withAccount(account, work));
  let imports: PracticeImportService;
  const complete = jest.fn();
  let keyBefore: string | undefined;
  let admin: DataSource;
  const testDatabase = 'ai_job_test_' + randomUUID().replace(/-/g, '');
  const wait = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Job did not settle');
  };
  beforeAll(async () => {
    admin = createDataSource();
    await admin.initialize();
    await admin.query('CREATE DATABASE ' + testDatabase);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = '/' + testDatabase;
    db = new DataSource({ ...typeormOptions(), url: url.href } as never);
    await db.initialize();
    await db.runMigrations();
    keyBefore = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-only-never-sent';
  });
  beforeEach(async () => {
    owner = 'ai-job-test-' + randomUUID() + '@example.invalid';
    account = await new AccountsService(db).ensure(owner);
    note = await db
      .getRepository(Note)
      .save({
        userId: account.id,
        title: 'Integration note',
        bodyMarkdown: 'Original body',
      });
    complete.mockReset().mockResolvedValue('Generated summary');
    const ai = new AiService(
      new NotesRepository(db),
      new QuestionsRepository(db),
      { complete } as never,
    );
    imports = new PracticeImportService(
      { extract: async () => 'Document text' } as never,
      { complete } as never,
      new NotesRepository(db),
      { listNames: async () => [] } as never,
      new QuestionsRepository(db),
      {} as never,
      db,
    );
    jobs = new AiJobsService(
      db,
      ai,
      {
        binding: async () => ({
          identity: 'test-profile',
          model: 'test-model',
        }),
      } as never,
      imports,
    );
    queue = new Queue('test-ai-' + randomUUID(), {
      connection: redisConnection(),
    });
    dispatcher = new AiDispatcher(db, queue, jobs);
  });
  afterEach(async () => {
    await worker?.close();
    worker = undefined;
    await queue.obliterate({ force: true });
    await queue.close();
    await db.query('DELETE FROM ai_job WHERE owner=$1', [owner]);
    await db.query('DELETE FROM practice_import_draft WHERE owner=$1', [owner]);
    await db.getRepository(Note).delete(note.id);
  });
  afterAll(async () => {
    if (keyBefore === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = keyBefore;
    await db.destroy();
    await admin.query('DROP DATABASE ' + testDatabase);
    await admin.destroy();
  });
  scenario(
    'accepts idempotently, enqueues and completes from immutable source without changing the editor source',
    async () => {
      const key = randomUUID();
      const [a, b] = await Promise.all([
        jobs.create(
          owner,
          note.id,
          { action: 'summarize', provider: 'openai' },
          key,
        ),
        jobs.create(
          owner,
          note.id,
          { action: 'summarize', provider: 'openai' },
          key,
        ),
      ]);
      expect(a.id).toBe(b.id);
      expect(a.status).toBe('queued');
      expect(complete).not.toHaveBeenCalled();
      await expect(
        jobs.create(
          owner,
          note.id,
          { action: 'expand', provider: 'openai' },
          key,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(jobs.get('other-user', a.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await db
        .getRepository(Note)
        .update(note.id, { bodyMarkdown: 'Edited while queued' });
      const processor = new AiProcessor(jobs);
      worker = new Worker(queue.name, (job) => processor.process(job), {
        connection: redisConnection(),
        concurrency: 1,
      });
      await dispatcher.tick();
      await wait(
        async () => (await jobs.get(owner, a.id)).status === 'succeeded',
      );
      const result = await jobs.result(owner, a.id);
      expect(result?.markdown).toBe('Generated summary');
      expect(complete.mock.calls[0][0].user).toContain('Original body');
      expect(complete.mock.calls[0][0].user).not.toContain(
        'Edited while queued',
      );
      const stored = await jobs.internal(a.id);
      expect(JSON.stringify(stored?.input)).not.toContain(
        'test-only-never-sent',
      );
      await expect(jobs.apply(owner, a.id)).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(
        (await db.getRepository(Note).findOneByOrFail({ id: note.id }))
          .bodyMarkdown,
      ).toBe('Edited while queued');
    },
  );
  scenario(
    'commits generated questions once even when finalization is delivered twice',
    async () => {
      complete.mockResolvedValue(
        JSON.stringify({
          items: [
            {
              prompt: 'Which?',
              choiceA: 'A',
              choiceB: 'B',
              choiceC: 'C',
              choiceD: 'D',
              correctChoice: 'A',
            },
          ],
        }),
      );
      const view = await jobs.create(
        owner,
        note.id,
        {
          action: 'generate-questions',
          provider: 'openai',
          targetLang: 'vi',
          count: 1,
        },
        randomUUID(),
      );
      const row = await jobs.begin(view.id);
      await jobs.generate(row!);
      await Promise.all([jobs.finalize(view.id), jobs.finalize(view.id)]);
      expect(
        await db.getRepository(Question).countBy({ note: { id: note.id } }),
      ).toBe(1);
      expect((await jobs.result(owner, view.id))?.questionIds).toHaveLength(1);
      expect(await jobs.begin(view.id)).toBeNull();
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );
  scenario(
    'expires queued work before invoking AI and bounds admission',
    async () => {
      const view = await jobs.create(
        owner,
        note.id,
        { action: 'summarize', provider: 'openai' },
        randomUUID(),
      );
      await jobs.create(
        owner,
        note.id,
        { action: 'expand', provider: 'openai' },
        randomUUID(),
      );
      await jobs.create(
        owner,
        note.id,
        { action: 'generate-content', provider: 'openai' },
        randomUUID(),
      );
      await expect(
        jobs.create(
          owner,
          note.id,
          { action: 'summarize', provider: 'openai' },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ code: 'AI_QUEUE_LIMIT' });
      await db.query(
        "UPDATE ai_job SET expires_at=now()-interval '1 second' WHERE id=$1",
        [view.id],
      );
      expect(await jobs.begin(view.id)).toBeNull();
      expect((await jobs.get(owner, view.id)).error?.code).toBe(
        'AI_JOB_EXPIRED',
      );
      expect(complete).not.toHaveBeenCalled();
    },
  );
  scenario(
    'recovers output saved before a worker crash without calling AI again',
    async () => {
      const view = await jobs.create(
        owner,
        note.id,
        { action: 'summarize', provider: 'openai' },
        randomUUID(),
      );
      const row = await jobs.begin(view.id);
      await jobs.generate(row!);
      await db.query('UPDATE ai_job SET attempts=2 WHERE id=$1', [view.id]);
      await new AiProcessor(jobs).process({
        data: { jobId: view.id },
        attemptsMade: 1,
      } as never);
      expect((await jobs.get(owner, view.id)).status).toBe('succeeded');
      expect(complete).toHaveBeenCalledTimes(1);
      await jobs.apply(owner, view.id);
      expect(
        (await db.getRepository(Note).findOneByOrFail({ id: note.id }))
          .bodyMarkdown,
      ).toBe('Generated summary');
    },
  );
  scenario(
    'keeps document results across service restarts, scopes drafts by owner and grades only once',
    async () => {
      complete.mockResolvedValue(
        JSON.stringify({
          items: [
            {
              prompt: 'CV question',
              choiceA: 'A',
              choiceB: 'B',
              choiceC: 'C',
              choiceD: 'D',
              correctChoice: 'A',
            },
          ],
        }),
      );
      const view = await jobs.createImport(
        owner,
        {
          source: 'cv',
          lang: 'vi',
          level: 'junior',
          filename: 'sample.pdf',
          mime: 'application/pdf',
          buffer: Buffer.from('test'),
        },
        randomUUID(),
      );
      const row = await jobs.begin(view.id);
      await jobs.generate(row!);
      await jobs.finalize(view.id);
      const result = await jobs.result(owner, view.id);
      expect(result?.draftId).toBeTruthy();
      expect(result?.items?.[0]).not.toHaveProperty('correctChoice');
      expect((await jobs.internal(view.id))?.input.import).toBeUndefined();
      const restarted = new PracticeImportService(
        {} as never,
        {} as never,
        new NotesRepository(db),
        {} as never,
        new QuestionsRepository(db),
        {} as never,
        db,
      );
      const draftId = result!.draftId!,
        questionId = result!.items![0].id;
      await expect(
        restarted.keep(draftId, { keeps: [] }, 'another-owner'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await restarted.keep(
        draftId,
        { keeps: [{ questionId, noteId: note.id, topicNames: [] }] },
        owner,
      );
      const first = await restarted.grade(
        draftId,
        { answers: [{ questionId, choice: 'A' }] },
        owner,
      );
      const second = await restarted.grade(
        draftId,
        { answers: [{ questionId, choice: 'A' }] },
        owner,
      );
      expect(first).toEqual(second);
      expect(first.correct).toBe(1);
      expect(
        await db.getRepository(Question).countBy({ note: { id: note.id } }),
      ).toBe(1);
    },
  );

  scenario(
    'returns HTTP 202 before inference, with location, idempotency and owner-scoped result access',
    async () => {
      const module = await Test.createTestingModule({
        controllers: [AiJobsController],
        providers: [{ provide: AiJobsService, useValue: jobs }],
      }).compile();
      const app = module.createNestApplication();
      app.use((req: any, _res: any, next: () => void) => {
        req.user = { email: req.headers['x-test-owner'] || owner };
        next();
      });
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
      );
      app.useGlobalFilters(new AppErrorFilter());
      await app.init();
      try {
        const response = await request(app.getHttpServer())
          .post(`/notes/${note.id}/ai-jobs`)
          .set('Idempotency-Key', randomUUID())
          .send({ action: 'summarize', provider: 'openai' })
          .expect(202);
        expect(response.headers.location).toBe('/ai-jobs/' + response.body.id);
        expect(response.body.status).toBe('queued');
        expect(complete).not.toHaveBeenCalled();
        await request(app.getHttpServer())
          .get('/ai-jobs/' + response.body.id)
          .set('x-test-owner', 'different-user')
          .expect(404);
        await request(app.getHttpServer())
          .get('/ai-jobs/' + response.body.id + '/result')
          .expect(409);
      } finally {
        await app.close();
      }
    },
  );
  scenario(
    'cleans expired document data even when Redis dispatch fails',
    async () => {
      const expiredId = randomUUID();
      await db.query(
        `INSERT INTO practice_import_draft(id,owner,payload,expires_at) VALUES($1,$2,'{}',now()-interval '1 hour')`,
        [expiredId, owner],
      );
      await jobs.create(
        owner,
        note.id,
        { action: 'summarize', provider: 'openai' },
        randomUUID(),
      );
      const get = jest
        .spyOn(queue, 'getJob')
        .mockRejectedValueOnce(new Error('Redis unavailable'));
      await dispatcher.tick();
      get.mockRestore();
      expect(
        await db.query('SELECT id FROM practice_import_draft WHERE id=$1', [
          expiredId,
        ]),
      ).toHaveLength(0);
    },
  );
});
