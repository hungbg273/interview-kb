import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Question } from '../entities/question.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class QuestionsRepository extends BaseRepository<Question> {
  constructor(dataSource: DataSource) {
    super(Question, dataSource);
  }

  listByNote(noteId: string) {
    return this.repo.find({
      where: { note: { id: noteId } },
      order: { createdAt: 'DESC' },
    });
  }

  listRecentAiByNote(noteId: string, take: number) {
    return this.repo.find({
      where: { note: { id: noteId }, source: 'ai' },
      order: { createdAt: 'DESC' },
      take,
    });
  }
}
