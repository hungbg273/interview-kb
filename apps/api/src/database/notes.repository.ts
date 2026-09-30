import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Note } from '../entities/note.entity';
import { BaseRepository } from './base.repository';

export type ListNotesFilter = {
  topicId?: string;
  uncategorized?: boolean;
  q?: string;
  page: number;
  pageSize: number;
};

const NOTE_RELATIONS = ['noteTopics', 'noteTopics.topic', 'questions'];

@Injectable()
export class NotesRepository extends BaseRepository<Note> {
  constructor(dataSource: DataSource) {
    super(Note, dataSource);
  }

  findDetail(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: NOTE_RELATIONS,
    });
  }

  searchByTitle(q: string) {
    return this.repo
      .createQueryBuilder('note')
      .select(['note.id', 'note.title'])
      .where('LOWER(note.title) LIKE LOWER(:q)', { q: `%${q}%` })
      .orderBy('note.updatedAt', 'DESC')
      .take(50)
      .getMany();
  }

  async list(filter: ListNotesFilter) {
    const skip = (filter.page - 1) * filter.pageSize;
    const q = filter.q?.trim();

    if (q) {
      const ids = await this.searchIds(q, {
        topicId: filter.topicId,
        uncategorized: filter.uncategorized,
        limit: filter.pageSize,
        offset: skip,
      });
      if (ids.length === 0) return [];
      const items = await this.repo.find({
        where: { id: In(ids) },
        relations: NOTE_RELATIONS,
      });
      const order = new Map(ids.map((id, i) => [id, i]));
      items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return items;
    }

    const qb = this.repo
      .createQueryBuilder('note')
      .distinct(true)
      .leftJoinAndSelect('note.noteTopics', 'noteTopics')
      .leftJoinAndSelect('noteTopics.topic', 'topic')
      .leftJoinAndSelect('note.questions', 'questions')
      .orderBy('note.updatedAt', 'DESC')
      .skip(skip)
      .take(filter.pageSize);

    if (filter.topicId) {
      qb.innerJoin('note_topic', 'nt_filter', 'nt_filter.note_id = note.id').andWhere(
        'nt_filter.topic_id = :topicId',
        { topicId: filter.topicId },
      );
    }
    if (filter.uncategorized) {
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM note_topic nt0 WHERE nt0.note_id = note.id)`,
      );
    }

    return qb.getMany();
  }

  private async searchIds(
    q: string,
    opts: {
      topicId?: string;
      uncategorized?: boolean;
      limit: number;
      offset: number;
    },
  ): Promise<string[]> {
    const params: unknown[] = [q];
    let sql = `SELECT n.id FROM note n WHERE n.search_vector @@ plainto_tsquery('english', $1)`;
    if (opts.topicId) {
      params.push(opts.topicId);
      sql += ` AND EXISTS (SELECT 1 FROM note_topic nt WHERE nt.note_id = n.id AND nt.topic_id = $${params.length})`;
    }
    if (opts.uncategorized) {
      sql += ` AND NOT EXISTS (SELECT 1 FROM note_topic nt0 WHERE nt0.note_id = n.id)`;
    }
    params.push(opts.limit, opts.offset);
    sql += ` ORDER BY n.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = (await this.repo.query(sql, params)) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }
}
