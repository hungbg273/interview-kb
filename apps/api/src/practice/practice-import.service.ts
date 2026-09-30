import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AiLang, CorrectChoice } from '@kb/shared';
import { isValidMcq } from '@kb/shared';
import { AppError } from '../common/app-error';
import { NoteTopicsRepository } from '../database/note-topics.repository';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { Note } from '../entities/note.entity';
import { Question } from '../entities/question.entity';
import { LlmClient, type ProviderEnv } from '../ai/llm.client';
import { TopicsService } from '../topics/topics.service';
import { DocumentExtractor } from './document-extractor';

const LANG: Record<AiLang, string> = {
  en: 'English',
  vi: 'Vietnamese',
};

const HOUR_MS = 60 * 60 * 1000;

export type ImportLevel = 'fresher' | 'junior' | 'middle' | 'senior' | 'expert';

type DraftQuestion = {
  id: string;
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  correctChoice: CorrectChoice;
  explanationMarkdown: string | null;
  suggestedTopics: string[];
};

type KeepRow = { questionId: string; noteId: string; topicNames: string[] };

type Draft = {
  id: string;
  createdAt: number;
  lang: AiLang;
  questions: DraftQuestion[];
  keeps: KeepRow[];
};

type StartInput = {
  source: 'cv' | 'jd';
  lang: AiLang;
  level: ImportLevel;
  filename: string;
  mime: string;
  buffer: Buffer;
};

function parseJsonArray(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, '').trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function env(): ProviderEnv {
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
  };
}

function toPublic(row: DraftQuestion) {
  return {
    id: row.id,
    prompt: row.prompt,
    choiceA: row.choiceA,
    choiceB: row.choiceB,
    choiceC: row.choiceC,
    choiceD: row.choiceD,
    suggestedTopics: row.suggestedTopics,
  };
}

function topicNamesOf(item: unknown): string[] {
  if (!item || typeof item !== 'object') return [];
  const raw = (item as { suggestedTopics?: unknown }).suggestedTopics;
  if (!Array.isArray(raw)) return [];
  return raw.filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
}

@Injectable()
export class PracticeImportService {
  private readonly drafts = new Map<string, Draft>();

  constructor(
    private readonly extractor: DocumentExtractor,
    private readonly llm: LlmClient,
    private readonly notes: NotesRepository,
    private readonly topics: TopicsService,
    private readonly questions: QuestionsRepository,
    private readonly noteTopics: NoteTopicsRepository,
  ) {}

  async start(input: StartInput) {
    const text = (await this.extractor.extract(input.buffer, input.mime, input.filename)).trim();
    if (!text) throw AppError.validation('Could not read text from the file');

    const raw = await this.llm.complete({
      provider: 'openai',
      env: env(),
      system: `Return ONLY a JSON array of exactly 8 multiple-choice items. Write prompt, choices, explanationMarkdown, and suggestedTopics in ${LANG[input.lang]}. Seniority level: ${input.level}. Mix technical and product interview questions from the document. Each item: prompt, choiceA, choiceB, choiceC, choiceD, correctChoice (A|B|C|D), explanationMarkdown, suggestedTopics (string array). Exactly one correctChoice.`,
      user: `${input.source.toUpperCase()}: ${input.filename}\n\n${text}`,
    });

    const parsed = parseJsonArray(raw)
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .filter((item) => isValidMcq(item as never))
      .slice(0, 8)
      .map((item) => {
        const id = typeof item.id === 'string' && item.id ? item.id : randomUUID();
        return {
          id,
          prompt: String(item.prompt).trim(),
          choiceA: String(item.choiceA).trim(),
          choiceB: String(item.choiceB).trim(),
          choiceC: String(item.choiceC).trim(),
          choiceD: String(item.choiceD).trim(),
          correctChoice: item.correctChoice as CorrectChoice,
          explanationMarkdown:
            typeof item.explanationMarkdown === 'string'
              ? item.explanationMarkdown.trim()
              : null,
          suggestedTopics: topicNamesOf(item),
        } satisfies DraftQuestion;
      });

    if (parsed.length === 0) throw AppError.aiUpstream('No valid questions from the model');

    const draft: Draft = {
      id: randomUUID(),
      createdAt: Date.now(),
      lang: input.lang,
      questions: parsed,
      keeps: [],
    };
    this.drafts.set(draft.id, draft);
    return { draftId: draft.id, items: parsed.map(toPublic) };
  }

  async keep(draftId: string, body: { keeps: KeepRow[] }) {
    const draft = this.requireDraft(draftId);
    const known = new Set(draft.questions.map((q) => q.id));
    for (const row of body.keeps) {
      if (!known.has(row.questionId)) {
        throw AppError.validation('Unknown question id');
      }
      const note = await this.notes.findById(row.noteId);
      if (!note) throw AppError.validation('Unknown note id');
    }
    draft.keeps = body.keeps;
  }

  async grade(draftId: string, body: { answers: Array<{ questionId: string; choice: string }> }) {
    const draft = this.requireDraft(draftId);
    const byId = new Map(draft.questions.map((q) => [q.id, q]));
    const items = body.answers.map((answer) => {
      const row = byId.get(answer.questionId);
      if (!row) throw AppError.validation('Unknown question id');
      const ok = row.correctChoice === answer.choice;
      return {
        questionId: row.id,
        prompt: row.prompt,
        choice: answer.choice as CorrectChoice,
        correctChoice: row.correctChoice,
        ok,
        explanationMarkdown: row.explanationMarkdown,
      };
    });

    await this.persistKeeps(draft);
    this.drafts.delete(draft.id);

    return {
      total: items.length,
      correct: items.filter((item) => item.ok).length,
      items,
    };
  }

  private async persistKeeps(draft: Draft) {
    for (const keep of draft.keeps) {
      const row = draft.questions.find((q) => q.id === keep.questionId);
      if (!row) continue;
      const question = new Question();
      question.note = { id: keep.noteId } as Note;
      question.prompt = row.prompt;
      question.choiceA = row.choiceA;
      question.choiceB = row.choiceB;
      question.choiceC = row.choiceC;
      question.choiceD = row.choiceD;
      question.correctChoice = row.correctChoice;
      question.explanationMarkdown = row.explanationMarkdown;
      question.lang = draft.lang;
      question.source = 'ai';
      await this.questions.save(question);

      for (const name of keep.topicNames) {
        const topic = await this.resolveTopic(name);
        await this.noteTopics.add(keep.noteId, topic.id);
      }
    }
  }

  private async resolveTopic(name: string) {
    const hits = await this.topics.searchByName(name);
    const exact = hits.find((topic) => topic.name.toLowerCase() === name.toLowerCase());
    if (exact) return exact;
    return this.topics.create({ name });
  }

  private requireDraft(id: string): Draft {
    const draft = this.drafts.get(id);
    if (!draft || Date.now() - draft.createdAt > HOUR_MS) {
      if (draft) this.drafts.delete(id);
      throw AppError.notFound('Draft not found');
    }
    return draft;
  }
}
