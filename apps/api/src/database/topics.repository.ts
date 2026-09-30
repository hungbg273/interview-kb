import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Topic } from '../entities/topic.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class TopicsRepository extends BaseRepository<Topic> {
  constructor(dataSource: DataSource) {
    super(Topic, dataSource);
  }

  listRoots() {
    return this.repo
      .createQueryBuilder('topic')
      .where(
        `NOT EXISTS (SELECT 1 FROM topic_parent tp WHERE tp.child_id = topic.id)`,
      )
      .orderBy('topic.name', 'ASC')
      .getMany();
  }

  listChildren(parentId: string) {
    return this.repo
      .createQueryBuilder('topic')
      .innerJoin('topic_parent', 'tp', 'tp.child_id = topic.id')
      .where('tp.parent_id = :parentId', { parentId })
      .orderBy('topic.name', 'ASC')
      .getMany();
  }

  searchByName(q: string) {
    return this.repo
      .createQueryBuilder('topic')
      .where('LOWER(topic.name) LIKE LOWER(:q)', { q: `%${q}%` })
      .orderBy('topic.name', 'ASC')
      .take(50)
      .getMany();
  }
}
