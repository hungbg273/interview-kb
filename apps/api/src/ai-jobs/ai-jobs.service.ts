import { accountForEmail } from '../accounts/accounts.service';
import { withAccount } from '../accounts/account-context';
import { Optional } from '@nestjs/common';
import {
  PracticeImportService,
  StartInput,
  ImportDraft,
} from '../practice/practice-import.service';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { Subject } from 'rxjs';
import type { AiJobView, AiJobResult, CreateQuestionBody } from '@kb/shared';
import { AppError } from '../common/app-error';
import { AiService, AiPreparedRequest } from '../ai/ai.service';
import { TranscriptClient } from '../ai/transcript.client';
import { RunAiDto } from '../ai/dto';
import { providerConfig } from '../ai/llm.client';
import { VIETNAMESE_STYLE } from '../ai/prompts/vietnamese-style';
import { ChatgptConnection } from '../chatgpt/chatgpt.connection';
import { Note } from '../entities/note.entity';
import { Question } from '../entities/question.entity';
import { isValidMcq } from '@kb/shared';
import { parseLlmJsonArray } from '../ai/llm-json';
import {
  ACTIVE_STATES,
  isTerminal,
  sourceHash,
  safeJobError,
} from './ai-job.policy';

export type StoredJob = {
  id: string;
  owner: string;
  note_id: string | null;
  note_title: string;
  action: RunAiDto['action'] | 'import-document';
  provider: RunAiDto['provider'];
  status: AiJobView['status'];
  stage: string;
  revision: number;
  attempts: number;
  input: {
    dto: RunAiDto;
    request: AiPreparedRequest;
    import?: Omit<StartInput, 'buffer' | 'owner'> & { base64: string };
    video?: { videoUrl: string; lang: 'en' | 'vi' };
  };
  source_hash: string;
  output: {
    markdown?: string;
    questions?: CreateQuestionBody[];
    draft?: ImportDraft;
    video?: { markdown: string; title: string; sourceUrl: string };
  } | null;
  result: AiJobResult | null;
  error: AiJobView['error'];
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  result_expires_at: Date;
  payload_hash: string;
};
@Injectable()
export class AiJobsService {
  readonly changes = new Subject<{ owner: string; job: AiJobView }>();
  constructor(
    private readonly db: DataSource,
    private readonly ai: AiService,
    private readonly chatgpt: ChatgptConnection,
    private readonly transcripts: TranscriptClient,
    @Optional() private readonly imports?: PracticeImportService,
  ) {}
  view(row: StoredJob): AiJobView {
    return {
      id: row.id,
      noteId: row.note_id,
      noteTitle: row.note_title,
      action: row.action,
      provider: row.provider,
      status: row.status,
      stage: row.stage,
      revision: row.revision,
      attempts: row.attempts,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      error: row.error,
    };
  }
  async internal(id: string, manager: EntityManager = this.db.manager) {
    return (
      await manager.query('SELECT * FROM ai_job WHERE id=$1', [id])
    )[0] as StoredJob | undefined;
  }
  async owned(owner: string, id: string) {
    const row = await this.internal(id);
    if (!row || row.owner !== owner)
      throw AppError.notFound('Không tìm thấy yêu cầu AI.');
    if (row.note_id) {
      const account = await accountForEmail(this.db, owner);
      if (
        !(await this.db
          .getRepository(Note)
          .existsBy({ id: row.note_id, userId: account.id }))
      )
        throw AppError.notFound();
    }
    return row;
  }
  async get(owner: string, id: string) {
    return this.view(await this.owned(owner, id));
  }
  async list(owner: string, active = false) {
    const rows: StoredJob[] = await this.db.query(
      `SELECT * FROM ai_job WHERE owner=$1 AND (note_id IS NULL OR EXISTS(SELECT 1 FROM note n JOIN app_user u ON u.id=n.user_id WHERE n.id=ai_job.note_id AND u.email=lower($1))) ${active ? "AND status IN ('queued','running','retrying')" : "AND created_at > now()-interval '7 days'"} ORDER BY created_at DESC LIMIT 100`,
      [owner],
    );
    return rows.map((row) => this.view(row));
  }
  async create(owner: string, noteId: string, dto: RunAiDto, key: string) {
    const account = await accountForEmail(this.db, owner);
    const note = await this.db
      .getRepository(Note)
      .findOneBy({ id: noteId, userId: account.id });
    if (!note) throw AppError.notFound('Không tìm thấy ghi chú.');
    const hash = createHash('sha256')
      .update(
        JSON.stringify([
          noteId,
          dto.action,
          dto.provider,
          dto.count ?? null,
          dto.targetLang ?? null,
          dto.difficulty ?? null,
        ]),
      )
      .digest('hex');
    const reuse = (existing: StoredJob) => {
      if (existing.payload_hash !== hash)
        throw AppError.conflict('Mã yêu cầu đã được dùng cho nội dung khác.');
      return this.view(existing);
    };
    const old: StoredJob[] = await this.db.query(
      'SELECT * FROM ai_job WHERE owner=$1 AND idempotency_key=$2',
      [owner, key],
    );
    if (old[0]) return reuse(old[0]);
    const request = await withAccount(account, () =>
      this.ai.prepare(noteId, dto),
    );
    request.style = VIETNAMESE_STYLE;
    if (dto.provider === 'chatgpt') {
      const binding = await this.chatgpt.binding(owner);
      request.expectedConnection = binding.identity;
      request.model = binding.model;
    } else {
      const config = providerConfig(dto.provider, process.env);
      if (!config.apiKey) throw AppError.aiNotConfigured();
      request.model = config.model;
    }
    const view = await this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'ai-owner:' + owner,
      ]);
      const existing: StoredJob[] = await manager.query(
        'SELECT * FROM ai_job WHERE owner=$1 AND idempotency_key=$2',
        [owner, key],
      );
      if (existing[0]) return reuse(existing[0]);
      const [{ count }] = await manager.query(
        `SELECT count(*) FROM ai_job WHERE owner=$1 AND status IN ('queued','running','retrying')`,
        [owner],
      );
      if (Number(count) >= 3)
        throw new AppError(
          'AI_QUEUE_LIMIT',
          'Bạn đang có 3 yêu cầu AI chưa hoàn tất. Vui lòng đợi.',
          429,
        );
      const current = await manager
        .getRepository(Note)
        .findOne({
          where: { id: noteId, userId: account.id },
          lock: { mode: 'pessimistic_read' },
        });
      if (!current || current.updatedAt.getTime() !== note.updatedAt.getTime())
        throw AppError.conflict(
          'Ghi chú vừa thay đổi. Vui lòng gửi lại yêu cầu AI.',
        );
      const id = randomUUID();
      const rows = await manager.query(
        `INSERT INTO ai_job(id,owner,note_id,note_title,idempotency_key,payload_hash,action,provider,input,source_hash,expires_at,result_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '5 minutes',now()+interval '7 days') RETURNING *`,
        [
          id,
          owner,
          noteId,
          note.title,
          key,
          hash,
          dto.action,
          dto.provider,
          JSON.stringify({ dto, request }),
          sourceHash(note.title, note.bodyMarkdown),
        ],
      );
      await manager.query('INSERT INTO ai_job_dispatch(job_id) VALUES($1)', [
        id,
      ]);
      return this.view(rows[0]);
    });
    return view;
  }
  async createImport(owner: string, input: StartInput, key: string) {
    const payload = {
      source: input.source,
      lang: input.lang,
      level: input.level,
      filename: input.filename,
      mime: input.mime,
      base64: input.buffer.toString('base64'),
    };
    const hash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'ai-owner:' + owner,
      ]);
      const [existing]: StoredJob[] = await manager.query(
        'SELECT * FROM ai_job WHERE owner=$1 AND idempotency_key=$2',
        [owner, key],
      );
      if (existing) {
        if (existing.payload_hash !== hash)
          throw AppError.conflict('Mã yêu cầu đã được dùng cho nội dung khác.');
        return this.view(existing);
      }
      const [{ count }] = await manager.query(
        "SELECT count(*) FROM ai_job WHERE owner=$1 AND status IN ('queued','running','retrying')",
        [owner],
      );
      if (Number(count) >= 3)
        throw new AppError(
          'AI_QUEUE_LIMIT',
          'Bạn đang có 3 yêu cầu AI chưa hoàn tất. Vui lòng đợi.',
          429,
        );
      const binding = await this.chatgpt.binding(owner),
        id = randomUUID();
      const request: AiPreparedRequest = {
        provider: 'chatgpt',
        system: '',
        user: '',
        model: binding.model,
        expectedConnection: binding.identity,
        style: VIETNAMESE_STYLE,
      };
      const [row] = await manager.query(
        `INSERT INTO ai_job(id,owner,note_id,note_title,idempotency_key,payload_hash,action,provider,input,source_hash,expires_at,result_expires_at) VALUES($1,$2,NULL,$3,$4,$5,'import-document','chatgpt',$6,$5,now()+interval '5 minutes',now()+interval '1 hour') RETURNING *`,
        [
          id,
          owner,
          input.filename,
          key,
          hash,
          JSON.stringify({
            dto: {
              action: 'generate-questions',
              provider: 'chatgpt',
              targetLang: input.lang,
              count: 8,
            },
            request,
            import: payload,
          }),
        ],
      );
      await manager.query('INSERT INTO ai_job_dispatch(job_id) VALUES($1)', [
        id,
      ]);
      return this.view(row);
    });
  }
  async createVideo(
    owner: string,
    input: {
      videoUrl: string;
      lang: 'en' | 'vi';
      provider: RunAiDto['provider'];
    },
    key: string,
  ) {
    const config = providerConfig(input.provider, process.env);
    if (!config.apiKey) throw AppError.aiNotConfigured();
    if (!(process.env.TRANSCRIPT_API_KEY ?? '').trim())
      throw AppError.aiNotConfigured('Chưa cấu hình dịch vụ trích xuất video.');
    const hash = createHash('sha256')
      .update(JSON.stringify([input.videoUrl, input.lang, input.provider]))
      .digest('hex');
    return this.db.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        'ai-owner:' + owner,
      ]);
      const [existing]: StoredJob[] = await manager.query(
        'SELECT * FROM ai_job WHERE owner=$1 AND idempotency_key=$2',
        [owner, key],
      );
      if (existing) {
        if (existing.payload_hash !== hash)
          throw AppError.conflict('Mã yêu cầu đã được dùng cho nội dung khác.');
        return this.view(existing);
      }
      const [{ count }] = await manager.query(
        "SELECT count(*) FROM ai_job WHERE owner=$1 AND status IN ('queued','running','retrying')",
        [owner],
      );
      if (Number(count) >= 3)
        throw new AppError(
          'AI_QUEUE_LIMIT',
          'Bạn đang có 3 yêu cầu AI chưa hoàn tất. Vui lòng đợi.',
          429,
        );
      const id = randomUUID();
      const request: AiPreparedRequest = {
        provider: input.provider,
        system: '',
        user: '',
        model: config.model,
        style: VIETNAMESE_STYLE,
      };
      const [row] = await manager.query(
        `INSERT INTO ai_job(id,owner,note_id,note_title,idempotency_key,payload_hash,action,provider,input,source_hash,expires_at,result_expires_at) VALUES($1,$2,NULL,$3,$4,$5,'summarize-video',$6,$7,$5,now()+interval '5 minutes',now()+interval '1 hour') RETURNING *`,
        [
          id,
          owner,
          input.videoUrl,
          key,
          hash,
          input.provider,
          JSON.stringify({
            dto: {
              action: 'summarize-video',
              provider: input.provider,
              targetLang: input.lang,
            },
            request,
            video: { videoUrl: input.videoUrl, lang: input.lang },
          }),
        ],
      );
      await manager.query('INSERT INTO ai_job_dispatch(job_id) VALUES($1)', [
        id,
      ]);
      return this.view(row);
    });
  }
  async notify(id: string) {
    const row = await this.internal(id);
    if (row) this.changes.next({ owner: row.owner, job: this.view(row) });
  }
  async fail(id: string, error: unknown, retry = false) {
    await this.db.query(
      `UPDATE ai_job SET status=$2,stage=$3,error=$4,revision=revision+1,updated_at=now() WHERE id=$1 AND status NOT IN ('succeeded','failed')`,
      [
        id,
        retry ? 'retrying' : 'failed',
        retry ? 'retrying' : 'failed',
        JSON.stringify(safeJobError(error)),
      ],
    );
    await this.notify(id);
  }
  async begin(id: string) {
    const row = await this.internal(id);
    if (!row || isTerminal(row.status)) return null;
    if (
      new Date(row.expires_at).getTime() <= Date.now() ||
      (row.attempts >= 2 && !row.output)
    ) {
      await this.fail(
        id,
        new AppError(
          'AI_JOB_EXPIRED',
          'Yêu cầu AI đã hết thời gian xử lý. Vui lòng thử lại.',
          408,
        ),
      );
      return null;
    }
    const [next] = await this.db.query(
      `UPDATE ai_job SET status='running',stage=$2,attempts=attempts+CASE WHEN output IS NULL THEN 1 ELSE 0 END,error=NULL,revision=revision+1,updated_at=now() WHERE id=$1 AND status NOT IN ('succeeded','failed') RETURNING *`,
      [id, row.output ? 'saving' : 'generating'],
    );
    await this.notify(id);
    return (Array.isArray(next) ? next[0] : next) as StoredJob;
  }
  async generate(row: StoredJob) {
    const account = await accountForEmail(this.db, row.owner);
    if (
      row.note_id &&
      !(await this.db
        .getRepository(Note)
        .existsBy({ id: row.note_id, userId: account.id }))
    )
      throw AppError.notFound('Ghi chú đã bị xóa.');
    if (row.provider === 'chatgpt') {
      const binding = await this.chatgpt.binding(row.owner);
      if (binding.identity !== row.input.request.expectedConnection)
        throw new AppError(
          'CHATGPT_RECONNECT_REQUIRED',
          'Kết nối ChatGPT đã thay đổi. Hãy tạo yêu cầu mới.',
          409,
        );
      if (!row.input.request.model) {
        const models = await this.chatgpt.models(row.owner);
        if (!models.length)
          throw AppError.aiUpstream('Không có mô hình ChatGPT khả dụng.');
        row.input.request.model = models[0].id;
        await this.db.query('UPDATE ai_job SET input=$2 WHERE id=$1', [
          row.id,
          JSON.stringify(row.input),
        ]);
      }
    }
    if (row.input.import) {
      if (!this.imports) throw AppError.aiUpstream();
      const { base64, ...input } = row.input.import;
      const draft = await withAccount(account, () =>
        this.imports!.generateDraft({
          ...input,
          buffer: Buffer.from(base64, 'base64'),
          owner: row.owner,
          model: row.input.request.model,
          expectedConnection: row.input.request.expectedConnection,
          style: row.input.request.style,
        }),
      );
      await this.db.query(
        "UPDATE ai_job SET output=$2,stage='saving',revision=revision+1,updated_at=now() WHERE id=$1 AND status='running'",
        [row.id, JSON.stringify({ draft })],
      );
      return;
    }
    if (row.input.video) {
      const { videoUrl, lang } = row.input.video;
      const { text, platform } = await this.transcripts.fetch(videoUrl);
      const markdown = await this.ai.summarizeVideo(text, {
        provider: row.provider,
        lang,
        owner: row.owner,
      });
      const title = `Video ${platform} · ${new Date().toISOString().slice(0, 10)}`;
      await this.db.query(
        "UPDATE ai_job SET output=$2,stage='saving',revision=revision+1,updated_at=now() WHERE id=$1 AND status='running'",
        [row.id, JSON.stringify({ video: { markdown, title, sourceUrl: videoUrl } })],
      );
      return;
    }
    const raw = await this.ai.generate(row.input.request, row.owner);
    let output: NonNullable<StoredJob['output']>;
    if (row.action === 'generate-questions') {
      const questions = parseLlmJsonArray(raw)
        .filter((item): item is CreateQuestionBody => isValidMcq(item as never))
        .slice(0, row.input.dto.count ?? 5);
      if (!questions.length)
        throw AppError.aiUpstream('AI chưa tạo được câu hỏi hợp lệ.');
      output = { questions };
    } else {
      if (!raw.trim() || raw.length > 100000)
        throw AppError.aiUpstream('Nội dung AI không hợp lệ hoặc quá dài.');
      output = { markdown: raw };
    }
    await this.db.query(
      `UPDATE ai_job SET output=$2,stage='saving',revision=revision+1,updated_at=now() WHERE id=$1 AND status='running'`,
      [row.id, JSON.stringify(output)],
    );
  }
  async finalize(id: string) {
    await this.db.transaction(async (manager) => {
      const [row]: StoredJob[] = await manager.query(
        'SELECT * FROM ai_job WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!row || isTerminal(row.status)) return;
      if (row.output?.draft) {
        if (!this.imports) throw AppError.aiUpstream();
        if (new Date(row.expires_at).getTime() <= Date.now())
          throw new AppError(
            'AI_JOB_EXPIRED',
            'Yêu cầu AI đã hết thời gian xử lý.',
            408,
          );
        await this.imports.saveDraft(row.output.draft, row.owner, manager);
        const result = {
          ...this.imports.publicDraft(row.output.draft),
          sourceHash: row.source_hash,
        };
        await manager.query(
          "UPDATE ai_job SET status='succeeded',stage='completed',result=$2,input=input-'import',error=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
          [id, JSON.stringify(result)],
        );
        return;
      }
      if (row.output?.video) {
        if (new Date(row.expires_at).getTime() <= Date.now())
          throw new AppError(
            'AI_JOB_EXPIRED',
            'Yêu cầu AI đã hết thời gian xử lý.',
            408,
          );
        const result: AiJobResult = {
          sourceHash: row.source_hash,
          markdown: row.output.video.markdown,
          title: row.output.video.title,
          sourceUrl: row.output.video.sourceUrl,
        };
        await manager.query(
          "UPDATE ai_job SET status='succeeded',stage='completed',result=$2,input=input-'video',error=NULL,revision=revision+1,updated_at=now() WHERE id=$1",
          [id, JSON.stringify(result)],
        );
        return;
      }
      if (!row.note_id) throw AppError.notFound();
      const account = await accountForEmail(this.db, row.owner);
      const note = await manager.getRepository(Note).findOne({
        where: { id: row.note_id, userId: account.id },
        lock: { mode: 'pessimistic_read' },
      });
      if (!note) throw AppError.notFound('Ghi chú đã bị xóa.');
      if (new Date(row.expires_at).getTime() <= Date.now())
        throw new AppError(
          'AI_JOB_EXPIRED',
          'Yêu cầu AI đã hết thời gian xử lý.',
          408,
        );
      if (!row.output) throw AppError.aiUpstream();
      const result: AiJobResult = { sourceHash: row.source_hash };
      if (row.output.questions) {
        const rows = row.output.questions.map((item) =>
          manager.getRepository(Question).create({
            note: { id: row.note_id! },
            userId: account.id,
            prompt: item.prompt.trim(),
            choiceA: item.choiceA.trim(),
            choiceB: item.choiceB.trim(),
            choiceC: item.choiceC.trim(),
            choiceD: item.choiceD.trim(),
            correctChoice: item.correctChoice,
            explanationMarkdown:
              typeof item.explanationMarkdown === 'string'
                ? item.explanationMarkdown.trim() || null
                : null,
            lang: row.input.dto.targetLang!,
            source: 'ai',
          }),
        );
        result.questionIds = (await manager.save(Question, rows)).map(
          (item) => item.id,
        );
      } else result.markdown = row.output.markdown;
      await manager.query(
        `UPDATE ai_job SET status='succeeded',stage='completed',result=$2,error=NULL,revision=revision+1,updated_at=now() WHERE id=$1`,
        [id, JSON.stringify(result)],
      );
    });
    await this.notify(id);
  }
  async result(owner: string, id: string) {
    const row = await this.owned(owner, id);
    if (new Date(row.result_expires_at).getTime() < Date.now())
      throw new AppError(
        'AI_RESULT_EXPIRED',
        'Kết quả AI đã hết hạn lưu trữ.',
        410,
      );
    if (row.status !== 'succeeded')
      throw AppError.conflict('Yêu cầu AI chưa hoàn tất thành công.');
    return row.result;
  }
  async apply(owner: string, id: string) {
    const account = await accountForEmail(this.db, owner);
    await this.owned(owner, id);
    return this.db.transaction(async (manager) => {
      const row = await this.internal(id, manager);
      if (!row || row.owner !== owner) throw AppError.notFound();
      if (new Date(row.result_expires_at).getTime() < Date.now())
        throw new AppError(
          'AI_RESULT_EXPIRED',
          'Kết quả AI đã hết hạn lưu trữ.',
          410,
        );
      if (row.status !== 'succeeded' || !row.result?.markdown)
        throw AppError.conflict('Không có nội dung AI để áp dụng.');
      if (!row.note_id)
        throw AppError.conflict('Kết quả tài liệu được mở trong Luyện tập.');
      const note = await manager.getRepository(Note).findOne({
        where: { id: row.note_id, userId: account.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!note) throw AppError.notFound('Ghi chú đã bị xóa.');
      if (
        note.title === row.note_title &&
        note.bodyMarkdown === row.result.markdown
      )
        return { applied: true };
      if (sourceHash(note.title, note.bodyMarkdown) !== row.source_hash)
        throw AppError.conflict(
          'Ghi chú đã thay đổi từ lúc gửi AI. Hãy sao chép kết quả để chỉnh sửa thủ công hoặc tạo yêu cầu mới.',
        );
      note.bodyMarkdown = row.result.markdown;
      await manager.save(Note, note);
      return { applied: true };
    });
  }
}
