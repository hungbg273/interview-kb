import { Injectable } from '@nestjs/common';
import { isValidMcq } from '@kb/shared';
import { AppError } from '../common/app-error';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { Note } from '../entities/note.entity';
import { Question } from '../entities/question.entity';
import { RunAiDto } from './dto';
import { LlmClient, type ProviderEnv } from './llm.client';

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

    if (dto.action === 'summarize' || dto.action === 'expand') {
      const system =
        dto.action === 'summarize'
          ? 'Summarize the note in Markdown. Do not invent facts.'
          : 'Expand the note in Markdown with more interview-relevant detail. Do not invent APIs.';
      const markdown = await this.llm.complete({
        provider: dto.provider,
        env,
        system,
        user: body,
      });
      return { markdown };
    }

    const raw = await this.llm.complete({
      provider: dto.provider,
      env,
      system:
        'Return ONLY a JSON array of multiple-choice items. Each item: prompt, choiceA, choiceB, choiceC, choiceD, correctChoice (A|B|C|D), explanationMarkdown. Exactly one correctChoice.',
      user: body,
    });

    let parsed: unknown = [];
    try {
      parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, '').trim());
    } catch {
      parsed = [];
    }
    const list = Array.isArray(parsed) ? parsed : [];
    const valid = list.filter(isValidMcq).slice(0, 8);

    for (const item of valid) {
      const question = new Question();
      question.note = { id: noteId } as Note;
      question.prompt = item.prompt.trim();
      question.choiceA = item.choiceA.trim();
      question.choiceB = item.choiceB.trim();
      question.choiceC = item.choiceC.trim();
      question.choiceD = item.choiceD.trim();
      question.correctChoice = item.correctChoice;
      question.explanationMarkdown = item.explanationMarkdown ?? null;
      question.source = 'ai';
      await this.questions.save(question);
    }

    if (valid.length === 0) {
      return [];
    }
    return this.questions.listRecentAiByNote(noteId, valid.length);
  }
}
