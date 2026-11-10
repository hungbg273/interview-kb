import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { QuestionInput } from '@kb/shared';
import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';
import { NotesRepository } from '../database/notes.repository';
import { TopicsRepository } from '../database/topics.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { PracticeAttemptsRepository } from '../database/practice-attempts.repository';
import { PracticeAttempt } from '../entities/practice-attempt.entity';
import { PracticeAttemptQuestion } from '../entities/practice-attempt-question.entity';
import { ChatgptConnection } from '../chatgpt/chatgpt.connection';
import { providerConfig } from '../ai/llm.client';
import { PracticeImportService } from './practice-import.service';
import { PracticeGradingService } from './practice-grading.service';
import {
  CreateAttemptDto,
  SavePracticeAnswerDto,
} from './practice-attempts.dto';
import {
  applyAnswer,
  gradeMcq,
  publicAttempt,
  settleAttempt,
} from './practice-policy';
@Injectable()
export class PracticeAttemptsService {
  constructor(
    private readonly attempts: PracticeAttemptsRepository,
    private readonly questions: QuestionsRepository,
    private readonly notes: NotesRepository,
    private readonly topics: TopicsRepository,
    private readonly imports: PracticeImportService,
    private readonly grading: PracticeGradingService,
    private readonly chatgpt: ChatgptConnection,
  ) {}
  async options(query: {
    noteId?: string | string[];
    topicId?: string | string[];
    lang: 'en' | 'vi';
  }) {
    const list = (v?: string | string[]) =>
      v ? (Array.isArray(v) ? v : [v]) : [];
    const pool = new Map<string, { type?: string }>();
    for (const id of list(query.noteId)) {
      if (!(await this.notes.findById(id))) throw AppError.notFound();
      for (const q of await this.questions.listByNote(id, query.lang))
        pool.set(q.id, q);
    }
    for (const id of list(query.topicId)) {
      if (!(await this.topics.findById(id))) throw AppError.notFound();
      for (const q of await this.questions.listByTopicId(id, query.lang))
        pool.set(q.id, q);
    }
    let chatgpt = false;
    try {
      await this.chatgpt.binding(currentAccount().email);
      chatgpt = true;
    } catch {}
    return {
      mcq: [...pool.values()].filter((q) => q.type !== 'essay').length,
      essay: [...pool.values()].filter((q) => q.type === 'essay').length,
      providers: {
        chatgpt,
        openai: !!providerConfig('openai', process.env).apiKey,
        deepseek: !!providerConfig('deepseek', process.env).apiKey,
      },
    };
  }
  async resumePending() {
    for (const pending of await this.attempts.pending()) {
      await this.attempts.change(
        pending.id,
        async (a, m) => {
          if (a.status === 'submitting') await this.queue(a, m);
          settleAttempt(a);
        },
        pending.userId,
      );
    }
  }
  async create(dto: CreateAttemptDto) {
    const total = dto.mcqCount + dto.essayCount;
    if (!Number.isInteger(total) || total < 1 || total > 50)
      throw AppError.validation('Tổng số câu phải từ 1 đến 50.');
    const account = currentAccount();
    const hash = createHash('sha256').update(JSON.stringify(dto)).digest('hex');
    const old = await this.attempts.existing(dto.requestKey, hash);
    if (old) return publicAttempt(old);
    const pool = new Map<string, QuestionInput>();
    const add = (rows: Array<{ id: string } & object>) => {
      for (const row of rows) pool.set(row.id, this.snapshot(row));
    };
    for (const id of dto.noteIds ?? []) {
      if (!(await this.notes.findById(id))) throw AppError.notFound();
      add(await this.questions.listByNote(id, dto.lang));
    }
    for (const id of dto.topicIds ?? []) {
      if (!(await this.topics.findById(id))) throw AppError.notFound();
      add(await this.questions.listByTopicId(id, dto.lang));
    }
    const drafts = await Promise.all(
      (dto.draftIds ?? []).map((id) =>
        this.imports.requireDraft(id, account.email),
      ),
    );
    for (const d of drafts) {
      if (d.lang !== dto.lang)
        throw AppError.validation('Ngôn ngữ bản nháp không khớp.');
      add(d.questions);
    }
    const shuffle = <T>(list: T[]) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const mcq = [...pool.values()].filter((q) => q.type !== 'essay'),
      essays = [...pool.values()].filter((q) => q.type === 'essay');
    if (mcq.length < dto.mcqCount || essays.length < dto.essayCount)
      throw AppError.validation(
        `Không đủ câu hỏi: có ${mcq.length} trắc nghiệm / ${essays.length} tự luận; cần ${dto.mcqCount} / ${dto.essayCount}. Hãy tạo thêm hoặc giảm số câu.`,
      );
    let binding: PracticeAttempt['binding'] = null;
    if (dto.essayCount) {
      if (!dto.provider) throw AppError.validation('Chọn AI chấm tự luận.');
      if (dto.provider === 'chatgpt') {
        const b = await this.chatgpt.binding(account.email);
        binding = { model: b.model, expectedConnection: b.identity };
      } else {
        const c = providerConfig(dto.provider, process.env);
        if (!c.apiKey) throw AppError.aiNotConfigured();
        binding = { model: c.model };
      }
    }
    const a = Object.assign(new PracticeAttempt(), {
      id: randomUUID(),
      userId: account.id,
      owner: account.email,
      requestKey: dto.requestKey,
      payloadHash: hash,
      status: 'in_progress',
      provider: dto.essayCount ? dto.provider! : null,
      lang: dto.lang,
      binding,
    });
    a.items = shuffle([
      ...shuffle(mcq).slice(0, dto.mcqCount),
      ...shuffle(essays).slice(0, dto.essayCount),
    ]).map((snapshot, position) =>
      Object.assign(new PracticeAttemptQuestion(), {
        id: randomUUID(),
        attemptId: a.id,
        position,
        snapshot,
        answer: null,
        revision: 0,
        state: 'unanswered',
        jobId: null,
        result: null,
      }),
    );
    return publicAttempt(
      await this.attempts.createAttempt(a, async (m) => {
        for (const d of drafts)
          await this.imports.consumeForAttempt(d.id, account.email, m);
      }),
    );
  }
  private snapshot(row: object): QuestionInput {
    const q = row as QuestionInput;
    const common = {
      prompt: q.prompt,
      lang: q.lang,
      explanationMarkdown: q.explanationMarkdown,
    };
    return q.type === 'essay'
      ? {
          ...common,
          type: 'essay',
          referenceAnswer: q.referenceAnswer,
          rubric: q.rubric,
        }
      : {
          ...common,
          type: 'mcq',
          choiceA: q.choiceA,
          choiceB: q.choiceB,
          choiceC: q.choiceC,
          choiceD: q.choiceD,
          correctChoice: q.correctChoice,
        };
  }
  private async queue(
    a: PracticeAttempt,
    m: EntityManager,
    only?: PracticeAttemptQuestion,
  ) {
    for (const i of only ? [only] : a.items) {
      if (
        i.state === 'graded' ||
        i.state === 'grading' ||
        i.state === 'grading_failed' ||
        !i.answer
      )
        continue;
      if (i.snapshot.type !== 'essay') {
        i.result = gradeMcq(i.snapshot, i.answer);
        i.state = 'graded';
      } else if (
        !(await this.attempts.enqueue(m, a, i, this.grading.prepare(a, i))) &&
        only
      )
        throw new AppError(
          'AI_QUEUE_LIMIT',
          'Đang có 3 yêu cầu AI. Vui lòng đợi rồi thử lại.',
          429,
        );
    }
    settleAttempt(a);
  }
  get(id: string) {
    return this.attempts.change(id, async (a, m) => {
      if (a.status === 'submitting') await this.queue(a, m);
      settleAttempt(a);
      return publicAttempt(a);
    });
  }
  save(id: string, itemId: string, dto: SavePracticeAnswerDto) {
    return this.attempts.change(id, async (a) => {
      if (a.status !== 'in_progress') throw AppError.conflict('Bài đã nộp.');
      const i = a.items.find((i) => i.id === itemId);
      if (!i) throw AppError.notFound();
      applyAnswer(i, dto.answer, dto.expectedRevision);
      return publicAttempt(a);
    });
  }
  grade(id: string, itemId: string, dto: SavePracticeAnswerDto) {
    return this.attempts.change(id, async (a, m) => {
      const i = a.items.find((i) => i.id === itemId);
      if (!i) throw AppError.notFound();
      if (i.state === 'graded' || i.state === 'grading')
        return publicAttempt(a);
      if (a.status !== 'in_progress') throw AppError.conflict('Bài đã nộp.');
      applyAnswer(i, dto.answer, dto.expectedRevision);
      await this.queue(a, m, i);
      return publicAttempt(a);
    });
  }
  submit(id: string, retry = false) {
    return this.attempts.change(id, async (a, m) => {
      if (a.status === 'completed') return publicAttempt(a);
      if (a.items.some((i) => !i.answer))
        throw AppError.validation('Hãy trả lời tất cả câu hỏi trước khi nộp.');
      if (retry) {
        for (const i of a.items)
          if (i.state === 'grading_failed') i.state = 'answered';
      }
      a.status = 'submitting';
      await this.queue(a, m);
      return publicAttempt(a);
    });
  }
}
