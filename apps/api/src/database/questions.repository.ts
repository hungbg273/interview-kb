import { Injectable } from '@nestjs/common';
import type { AiLang } from '@kb/shared';
import { DataSource } from 'typeorm';
import { Question } from '../entities/question.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class QuestionsRepository extends BaseRepository<Question> {
  constructor(dataSource: DataSource) {
    super(Question, dataSource);
  }

  listByNote(noteId: string, lang?: AiLang) {
    return this.repo.find({
      where: lang ? { note: { id: noteId }, lang } : { note: { id: noteId } },
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

  listByTopicId(topicId: string, lang?: AiLang) {
    const qb = this.repo
      .createQueryBuilder('q')
      .innerJoin('q.note', 'note')
      .innerJoin('note_topic', 'nt', 'nt.note_id = note.id')
      .where('nt.topic_id = :topicId', { topicId });
    if (lang) {
      qb.andWhere('q.lang = :lang', { lang });
    }
    return qb.getMany();
  }

  listByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return this.repo.createQueryBuilder('q').where('q.id IN (:...ids)', { ids }).getMany();
  }
}
