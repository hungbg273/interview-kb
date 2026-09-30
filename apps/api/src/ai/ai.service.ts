import { Injectable } from '@nestjs/common';
import { isValidMcq, type AiLang, type CreateQuestionBody } from '@kb/shared';
import { AppError } from '../common/app-error';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { Note } from '../entities/note.entity';
import { Question } from '../entities/question.entity';
import { RunAiDto } from './dto';
import { LlmClient, type ProviderEnv } from './llm.client';

const LANG: Record<AiLang, string> = {
  en: 'English',
  vi: 'Vietnamese',
};

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, '').trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

@Injectable()
export class AiService {
  constructor(
    private readonly notes: NotesRepository,
    private readonly questions: QuestionsRepository,
    private readonly llm: LlmClient,
  ) {}

  async run(noteId: string, dto: RunAiDto) {
    const note = await this.notes.findById(noteId);
    if (!note) throw AppError.notFound('Note not found');

    const env: ProviderEnv = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_MODEL: process.env.OPENAI_MODEL,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
      DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    };

    const body = `Title: ${note.title}\n\n${note.bodyMarkdown}`;

    if (dto.action === 'summarize' || dto.action === 'expand' || dto.action === 'generate-content') {
      const system =
        dto.action === 'summarize'
          ? 'Summarize the note in Markdown. Do not invent facts.'
          : dto.action === 'expand'
            ? 'Expand the note in Markdown with more interview-relevant detail. Do not invent APIs.'
            : 'Write a complete interview study note in Markdown from the title and any existing draft. Match the language of the title. Do not invent APIs or fake RFCs.';
      const markdown = await this.llm.complete({
        provider: dto.provider,
        env,
        system,
        user: body,
      });
      return { markdown };
    }

    if (dto.action === 'translate-note') {
      const lang = this.requireLang(dto.targetLang);
      const markdown = await this.llm.complete({
        provider: dto.provider,
        env,
        system: `Translate the note into ${LANG[lang]}. Keep Markdown structure. Do not add new facts.`,
        user: body,
      });
      return { markdown };
    }

    const lang = this.requireLang(dto.targetLang);
    const count = Math.min(8, Math.max(1, dto.count ?? 5));
    const difficulty = dto.difficulty ?? 'medium';
    const raw = await this.llm.complete({
      provider: dto.provider,
      env,
      system: `Return ONLY a JSON array of multiple-choice items. Exactly ${count} items. Difficulty: ${difficulty}. Write prompt, choices, and explanationMarkdown in ${LANG[lang]}. Each item: prompt, choiceA, choiceB, choiceC, choiceD, correctChoice (A|B|C|D), explanationMarkdown (required: 1-3 sentences explaining why the correct choice is right). Exactly one correctChoice.`,
      user: body,
    });

    const list = parseJsonArray(raw);
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
