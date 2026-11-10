import '../load-env';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createDataSource, typeormOptions } from '../database/typeorm.config';
import { AccountsService } from '../accounts/accounts.service';
import { withAccount, type Account } from '../accounts/account-context';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { TopicsRepository } from '../database/topics.repository';
import { PracticeAttemptsRepository } from '../database/practice-attempts.repository';
import { PracticeAttemptsService } from './practice-attempts.service';
import { PracticeGradingService } from './practice-grading.service';
import { AiJobsService } from '../ai-jobs/ai-jobs.service';
import { Question } from '../entities/question.entity';
import { Note } from '../entities/note.entity';
const suite =
  process.env.RUN_PRACTICE_INTEGRATION === '1' ? describe : describe.skip;
suite('persisted mixed attempts in isolated PostgreSQL', () => {
  let admin: DataSource,
    db: DataSource,
    svc: PracticeAttemptsService,
    jobs: AiJobsService,
    repo: PracticeAttemptsRepository,
    account: Account,
    note: Note;
  const database = 'practice_test_' + randomUUID().replace(/-/g, '');
  const binding = {
    binding: async () => ({ identity: 'test', model: 'test' }),
  };
  beforeAll(async () => {
    admin = createDataSource();
    await admin.initialize();
    await admin.query('CREATE DATABASE ' + database);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = '/' + database;
    db = new DataSource({ ...typeormOptions(), url: url.href } as never);
    await db.initialize();
    await db.runMigrations();
    account = await new AccountsService(db).ensure(
      'practice-test@example.invalid',
    );
    repo = new PracticeAttemptsRepository(db);
    svc = new PracticeAttemptsService(
      repo,
      new QuestionsRepository(db),
      new NotesRepository(db),
      new TopicsRepository(db),
      {} as never,
      new PracticeGradingService(),
      binding as never,
    );
    jobs = new AiJobsService(
      db,
      {
        generate: async () =>
          JSON.stringify({
            criteria: [{ criterionId: 'a', points: 8, explanation: 'Good' }],
            strengths: [],
            gaps: [],
            improvements: [],
          }),
      } as never,
      binding as never,
      {} as never,
      undefined,
      repo,
      svc,
    );
    note = await db
      .getRepository(Note)
      .save({ userId: account.id, title: 'Mixed', bodyMarkdown: 'Text' });
    await db.getRepository(Question).save([
      {
        userId: account.id,
        note,
        prompt: 'MCQ',
        type: 'mcq',
        choiceA: 'a',
        choiceB: 'b',
        choiceC: 'c',
        choiceD: 'd',
        correctChoice: 'A',
        lang: 'vi',
        source: 'manual',
      },
      {
        userId: account.id,
        note,
        prompt: 'Essay',
        type: 'essay',
        referenceAnswer: 'Reference',
        rubric: [{ id: 'a', description: 'Accuracy', maxPoints: 10 }],
        lang: 'vi',
        source: 'manual',
      },
    ]);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      await admin.query(
        'DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE)',
      );
      await admin.destroy();
    }
  });
  const run = (fn: () => Promise<void>) => withAccount(account, fn);
  it('migrates, snapshots, grades once under concurrent requests, and locks persisted answers', () =>
    run(async () => {
      const dto = {
        requestKey: randomUUID(),
        noteIds: [note.id],
        mcqCount: 1,
        essayCount: 1,
        lang: 'vi' as const,
        provider: 'chatgpt' as const,
      };
      const a = await svc.create(dto);
      expect((await svc.create(dto)).id).toBe(a.id);
      expect(JSON.stringify(a)).not.toContain('Reference');
      for (const i of a.items)
        await svc.save(a.id, i.id, {
          expectedRevision: 0,
          answer:
            i.type === 'essay'
              ? { type: 'essay', text: 'My answer' }
              : { type: 'mcq', choice: 'A' },
        });
      const essay = a.items.find((i) => i.type === 'essay')!;
      await Promise.all([
        svc.grade(a.id, essay.id, {
          expectedRevision: 1,
          answer: { type: 'essay', text: 'My answer' },
        }),
        svc.submit(a.id),
      ]);
      const rows = await db.query(
        "SELECT * FROM ai_job WHERE action='grade-practice-answer'",
      );
      expect(rows).toHaveLength(1);
      const job = await jobs.begin(rows[0].id);
      await jobs.generate(job!);
      await jobs.finalize(job!.id);
      const result = await svc.get(a.id);
      expect(result.status).toBe('completed');
      expect(result.score).toBe(9);
      await svc.submit(a.id);
      expect(
        (
          await db.query(
            "SELECT count(*) FROM ai_job WHERE action='grade-practice-answer'",
          )
        )[0].count,
      ).toBe('1');
      await expect(
        svc.save(a.id, essay.id, {
          expectedRevision: 2,
          answer: { type: 'essay', text: 'Edit' },
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      const stranger = await new AccountsService(db).ensure(
        'other-practice@example.invalid',
      );
      await withAccount(stranger, () =>
        expect(svc.get(a.id)).rejects.toMatchObject({ code: 'NOT_FOUND' }),
      );
    }));
  it('enforces database question variants', () =>
    run(async () => {
      await expect(
        db.query(
          "INSERT INTO question(user_id,note_id,prompt,type,reference_answer,rubric,choice_a,lang,source) VALUES($1,$2,'Bad','essay','ref','[]','wrong','vi','manual')",
          [account.id, note.id],
        ),
      ).rejects.toThrow();
    }));
  it('resumes submitted essays after unrelated jobs release capacity without a browser', () =>
    run(async () => {
      const a = await svc.create({
        requestKey: randomUUID(),
        noteIds: [note.id],
        mcqCount: 0,
        essayCount: 1,
        lang: 'vi',
        provider: 'chatgpt',
      });
      const blockers = [] as string[];
      for (let n = 0; n < 3; n++) {
        const id = randomUUID();
        blockers.push(id);
        await db.query(
          `INSERT INTO ai_job(id,owner,note_id,note_title,idempotency_key,payload_hash,action,provider,input,source_hash,expires_at,result_expires_at) VALUES($1,$2,NULL,'Blocker',$1,'hash','generate-content','chatgpt','{}','hash',now()+interval '5 minutes',now()+interval '7 days')`,
          [id, account.email],
        );
      }
      await svc.save(a.id, a.items[0].id, {
        expectedRevision: 0,
        answer: { type: 'essay', text: 'Answer' },
      });
      const submitted = await svc.submit(a.id);
      expect(submitted.items[0].state).toBe('answered');
      await db.query(
        "UPDATE ai_job SET status='failed' WHERE id=ANY($1::uuid[])",
        [blockers],
      );
      await svc.resumePending();
      expect((await svc.get(a.id)).items[0].state).toBe('grading');
      await db.query("UPDATE ai_job SET status='failed' WHERE status='queued'");
    }));
  it('checkpoints import batches and continues without regenerating completed questions', () =>
    run(async () => {
      const generateDraft = jest.fn(async (input) => ({
        id: randomUUID(),
        createdAt: Date.now(),
        lang: 'vi',
        keeps: [],
        questions: Array.from({ length: input.mcqCount }, (_, n) => ({
          id: randomUUID(),
          type: 'mcq',
          prompt: `Question ${(input.existingPrompts?.length ?? 0) + n}`,
          choiceA: 'a',
          choiceB: 'b',
          choiceC: 'c',
          choiceD: 'd',
          correctChoice: 'A',
          suggestedTopics: [],
        })),
      }));
      const batchJobs = new AiJobsService(
        db,
        {} as never,
        binding as never,
        {} as never,
        { generateDraft } as never,
      );
      const created = await batchJobs.createImport(
        account.email,
        {
          source: 'cv',
          lang: 'vi',
          level: 'junior',
          filename: 'cv.pdf',
          mime: 'application/pdf',
          buffer: Buffer.from('test'),
          mcqCount: 10,
          essayCount: 0,
        },
        randomUUID(),
      );
      const first = await batchJobs.begin(created.id);
      expect(await batchJobs.generate(first!)).toBe(false);
      const checkpoint = await batchJobs.internal(created.id);
      expect(checkpoint!.input.import!.progress!.questions).toHaveLength(8);
      expect(checkpoint!.status).toBe('queued');
      const next = await batchJobs.begin(created.id);
      await batchJobs.generate(next!);
      expect(generateDraft.mock.calls[1][0]).toMatchObject({
        mcqCount: 2,
        essayCount: 0,
      });
      expect(generateDraft.mock.calls[1][0].existingPrompts).toHaveLength(8);
      const complete = await batchJobs.internal(created.id);
      expect(complete!.output!.draft!.questions).toHaveLength(10);
    }));
});
