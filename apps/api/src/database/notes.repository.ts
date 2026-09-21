import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Note } from '../entities/note.entity';
import { BaseRepository } from './base.repository';

export type ListNotesFilter = {
  topicId?: string;
  tagId?: string;
  q?: string;
  page: number;
  pageSize: number;
};

const NOTE_RELATIONS = ['topic', 'noteTags', 'noteTags.tag', 'questions'];

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

  countByTopic(topicId: string) {
    return this.repo.count({ where: { topic: { id: topicId } } });
  }

  async list(filter: ListNotesFilter) {
    const skip = (filter.page - 1) * filter.pageSize;
    const q = filter.q?.trim();

    if (q) {
      const ids = await this.searchIds(q, {
        topicId: filter.topicId,
        tagId: filter.tagId,
        limit: filter.pageSize,
        offset: skip,
      });
      if (ids.length === 0) {
        return [];
      }
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
      .leftJoinAndSelect('note.topic', 'topic')
      .leftJoinAndSelect('note.noteTags', 'noteTags')
      .leftJoinAndSelect('noteTags.tag', 'tag')
      .leftJoinAndSelect('note.questions', 'questions')
      .orderBy('note.updatedAt', 'DESC')
      .skip(skip)
      .take(filter.pageSize);

    if (filter.topicId) {
      qb.andWhere('note.topic_id = :topicId', { topicId: filter.topicId });
    }
    if (filter.tagId) {
      qb.innerJoin('note_tag', 'nt_filter', 'nt_filter.note_id = note.id').andWhere(
        'nt_filter.tag_id = :tagId',
        { tagId: filter.tagId },
      );
    }

    return qb.getMany();
  }

  private async searchIds(
    q: string,
    opts: { topicId?: string; tagId?: string; limit: number; offset: number },
  ): Promise<string[]> {
    const params: unknown[] = [q];
    let sql = `SELECT n.id FROM note n`;
    if (opts.tagId) {
      params.push(opts.tagId);
      sql += ` INNER JOIN note_tag nt ON nt.note_id = n.id AND nt.tag_id = $${params.length}`;
    }
    sql += ` WHERE n.search_vector @@ plainto_tsquery('english', $1)`;
    if (opts.topicId) {
      params.push(opts.topicId);
      sql += ` AND n.topic_id = $${params.length}`;
    }
    params.push(opts.limit, opts.offset);
    sql += ` ORDER BY n.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const rows = (await this.repo.query(sql, params)) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }
}
