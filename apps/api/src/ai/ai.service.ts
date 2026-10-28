import { MARKDOWN_FORMAT } from "./prompts/markdown-format";
export type AiPreparedRequest = {
  provider: import('@kb/shared').AiProvider;
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  expectedConnection?: string;
  style?: string;
};
import { Injectable } from '@nestjs/common';
import { isValidMcq, type AiLang, type CreateQuestionBody } from '@kb/shared';
import { AppError } from '../common/app-error';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { Note } from '../entities/note.entity';
import { Question } from '../entities/question.entity';
import { RunAiDto } from './dto';
import { LlmClient, type ProviderEnv } from './llm.client';
import {
  NOTE_CONTEXT_CHARS,
  STEM_LIMIT,
  DOC_CONTEXT_CHARS,
  LONG_DOC_CHARS,
  clipText,
  parseLlmJsonArray,
} from './llm-json';

const LANG: Record<AiLang, string> = {
  en: 'English',
  vi: 'Vietnamese',
};

function providerEnv(): ProviderEnv {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  };
}

function noteContext(note: Note) {
  return `Title: ${note.title}\n\n${clipText(note.bodyMarkdown ?? '', NOTE_CONTEXT_CHARS)}`;
}

function topicNamesOf(note: Note): string[] {
  return (note.noteTopics ?? [])
    .map((row) => row.topic?.name)
    .filter((name): name is string => Boolean(name));
}

@Injectable()
export class AiService {
  constructor(
    private readonly notes: NotesRepository,
    private readonly questions: QuestionsRepository,
    private readonly llm: LlmClient,
  ) {}

  async prepare(noteId: string, dto: RunAiDto) {
    let request!: AiPreparedRequest;
    // Reuse the exact action prompts and validation from run; capture before inference.
    await this.execute(
      noteId,
      dto,
      undefined,
      async (input) => {
        request = input;
        return '';
      },
      true,
    );
    return request;
  }

  async generate(request: AiPreparedRequest, owner: string) {
    return this.llm.complete({ ...request, owner, env: providerEnv() });
  }

  /**
   * Summarize a video transcript into a structured Markdown study note.
   * Long transcripts are condensed in a first pass to stay within token limits.
   */
  async summarizeVideo(
    transcript: string,
    opts: { provider: import('@kb/shared').AiProvider; lang: AiLang; owner?: string },
  ): Promise<string> {
    const env = providerEnv();
    let source = transcript.trim();
    if (!source) throw AppError.validation('Transcript rỗng.');

    // Two-pass: condense very long transcripts into key facts first.
    if (source.length > LONG_DOC_CHARS) {
      const condensed = await this.llm.complete({
        provider: opts.provider,
        owner: opts.owner,
        env,
        system:
          'Extract the key facts, claims, and terminology from this video transcript as concise bullet points in the transcript language. Do not invent facts.',
        user: clipText(source, DOC_CONTEXT_CHARS),
        temperature: 0.2,
        maxTokens: 2000,
      });
      source = condensed.trim() || clipText(source, DOC_CONTEXT_CHARS);
    }

    const markdown = await this.llm.complete({
      provider: opts.provider,
      owner: opts.owner,
      env,
      system: `Summarize this video transcript into a structured study note in ${LANG[opts.lang]}. Use a short title heading, key points, and bullet lists. Keep only what the speaker says; do not invent facts.\n\n${MARKDOWN_FORMAT}`,
      user: clipText(source, DOC_CONTEXT_CHARS),
      temperature: 0.3,
      maxTokens: 2500,
    });
    if (!markdown.trim() || markdown.length > 100000)
      throw AppError.aiUpstream('Nội dung tóm tắt không hợp lệ hoặc quá dài.');
    return markdown.trim();
  }

  async run(noteId: string, dto: RunAiDto, owner?: string) {
    return this.execute(noteId, dto, owner);
  }

  private async execute(
    noteId: string,
    dto: RunAiDto,
    owner?: string,
    capture?: (input: AiPreparedRequest) => Promise<string>,
    preparing = false,
  ) {
    const note = await this.notes.findById(noteId, [
      'noteTopics',
      'noteTopics.topic',
    ]);
    if (!note) throw AppError.notFound('Note not found');

    const env = providerEnv();
    const complete = (
      request: AiPreparedRequest & { env: ProviderEnv; owner?: string },
    ) => {
      const { env: _env, owner: _owner, ...input } = request;
      return capture ? capture(input) : this.llm.complete(request);
    };
    const body = noteContext(note);

    if (
      dto.action === 'summarize' ||
      dto.action === 'expand' ||
      dto.action === 'generate-content'
    ) {
      const system =
        dto.action === 'summarize'
          ? 'Summarize the note in the same language. Plain language. Do not invent facts.'
          : dto.action === 'expand'
            ? 'Expand the note with interview-relevant detail. Plain language. Do not invent APIs or RFCs.'
            : 'Write a complete interview study note from the title and any draft. Match the title language. Short headings are ok. Do not invent APIs or fake RFCs.';
      const markdown = await complete({
        provider: dto.provider,
        owner,
        env,
        system: `${system}\n\n${MARKDOWN_FORMAT}`,
        user: body,
        temperature: 0.2,
        maxTokens: dto.action === 'summarize' ? 2500 : 20000,
      });
      return { markdown };
    }

    if (dto.action === 'translate-note') {
      const lang = this.requireLang(dto.targetLang);
      const markdown = await complete({
        provider: dto.provider,
        owner,
        env,
        system: `Translate the note into ${LANG[lang]}. Keep structure. Do not add new facts.\n\n${MARKDOWN_FORMAT}`,
        user: body,
        temperature: 0,
        maxTokens: 2500,
      });
      return { markdown };
    }

    const lang = this.requireLang(dto.targetLang);
    const count = Math.min(8, Math.max(1, dto.count ?? 5));
    const difficulty = dto.difficulty ?? 'medium';
    const existing = await this.questions.listByNote(noteId);
    const stems = existing
      .map((row) => row.prompt.trim())
      .filter(Boolean)
      .slice(0, STEM_LIMIT);
    const topics = topicNamesOf(note);
    const user = [
      body,
      topics.length ? `Topics: ${topics.join(', ')}` : '',
      stems.length
        ? `Existing questions:\n${stems.map((stem) => `- ${stem}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const raw = await complete({
      provider: dto.provider,
      owner,
      env,
      json: true,
      temperature: 0.4,
      maxTokens: 2000,
      system: `You are an interview coach. Use only the note. Return JSON {"items":[...]}. Exactly ${count} items. Language: ${LANG[lang]}. Difficulty: ${difficulty} (easy=recall, medium=apply, hard=trade-off or debug). Each item: prompt, choiceA, choiceB, choiceC, choiceD, correctChoice (A|B|C|D), explanationMarkdown (1-3 sentences). Exactly one correctChoice. Plausible distractors. Do not invent APIs or RFCs. Do not repeat existing question stems.`,
      user,
    });

    if (preparing) return [];
    const list = parseLlmJsonArray(raw);
    const valid = list
      .filter((item): item is CreateQuestionBody => isValidMcq(item as never))
      .slice(0, count);

    for (const item of valid) {
      const question = new Question();
      question.note = { id: noteId } as Note;
      question.prompt = item.prompt.trim();
      question.choiceA = item.choiceA.trim();
      question.choiceB = item.choiceB.trim();
      question.choiceC = item.choiceC.trim();
      question.choiceD = item.choiceD.trim();
      question.correctChoice = item.correctChoice;
      question.explanationMarkdown = item.explanationMarkdown?.trim() || null;
      question.lang = lang;
      question.source = 'ai';
      await this.questions.save(question);
    }

    if (valid.length === 0) {
      return [];
    }
    return this.questions.listRecentAiByNote(noteId, valid.length);
  }

  private requireLang(lang?: AiLang): AiLang {
    if (lang !== 'en' && lang !== 'vi') {
      throw AppError.validation('targetLang must be en or vi');
    }
    return lang;
  }
}
