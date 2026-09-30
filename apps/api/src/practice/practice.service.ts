import { Injectable } from '@nestjs/common';
import type { CorrectChoice } from '@kb/shared';
import { AppError } from '../common/app-error';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { TopicsRepository } from '../database/topics.repository';
import { Question } from '../entities/question.entity';
import { GradePracticeDto, PracticeQuestionsQuery } from './dto';

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toPublic(row: Question) {
  return {
    id: row.id,
    prompt: row.prompt,
    choiceA: row.choiceA,
    choiceB: row.choiceB,
    choiceC: row.choiceC,
    choiceD: row.choiceD,
  };
}

function asList(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

@Injectable()
export class PracticeService {
  constructor(
    private readonly questions: QuestionsRepository,
    private readonly notes: NotesRepository,
    private readonly topics: TopicsRepository,
  ) {}

  async listQuestions(query: PracticeQuestionsQuery) {
    const noteIds = asList(query.noteId);
    const topicIds = asList(query.topicId);
    if (noteIds.length === 0 && topicIds.length === 0) {
      throw AppError.validation('Provide at least one noteId or topicId');
    }
    if (query.lang !== 'en' && query.lang !== 'vi') {
      throw AppError.validation('lang must be en or vi');
    }

    const byId = new Map<string, Question>();
    for (const id of noteIds) {
      const note = await this.notes.findById(id);
      if (!note) throw AppError.notFound('Note not found');
      for (const row of await this.questions.listByNote(id, query.lang)) {
        byId.set(row.id, row);
      }
    }
    for (const id of topicIds) {
      const topic = await this.topics.findById(id);
      if (!topic) throw AppError.notFound('Topic not found');
      for (const row of await this.questions.listByTopicId(id, query.lang)) {
        byId.set(row.id, row);
      }
    }

    const limit = query.limit ?? 10;
    const items = shuffle([...byId.values()]).slice(0, limit).map(toPublic);
    return { items };
  }

  async grade(dto: GradePracticeDto) {
    const ids = dto.answers.map((a) => a.questionId);
    if (new Set(ids).size !== ids.length) {
      throw AppError.validation('Duplicate question id');
    }
    const rows = await this.questions.listByIds(ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    if (ids.some((id) => !byId.has(id))) {
      throw AppError.validation('Unknown question id');
    }

    const items = dto.answers.map((answer) => {
      const row = byId.get(answer.questionId)!;
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
    return {
      total: items.length,
      correct: items.filter((item) => item.ok).length,
      items,
    };
  }
}
