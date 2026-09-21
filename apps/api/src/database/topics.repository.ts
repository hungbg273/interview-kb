import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Topic } from '../entities/topic.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class TopicsRepository extends BaseRepository<Topic> {
  constructor(dataSource: DataSource) {
    super(Topic, dataSource);
  }

  list() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  countChildren(parentId: string) {
    return this.repo.count({ where: { parent: { id: parentId } } });
  }
}
