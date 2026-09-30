import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TopicParent } from '../entities/topic-parent.entity';
import { TopicEdge } from '../topics/topic-cycle';
import { BaseRepository } from './base.repository';

@Injectable()
export class TopicParentsRepository extends BaseRepository<TopicParent> {
  constructor(dataSource: DataSource) {
    super(TopicParent, dataSource);
  }

  listEdges(): Promise<TopicEdge[]> {
    return this.repo.find({
      select: { parentId: true, childId: true },
    });
  }

  exists(childId: string, parentId: string) {
    return this.repo.exists({ where: { childId, parentId } });
  }

  add(childId: string, parentId: string) {
    return this.repo.save({ childId, parentId });
  }

  async parentIds(childId: string) {
    const rows = await this.repo.find({ where: { childId } });
    return rows.map((row) => row.parentId);
  }

  async childIds(parentId: string) {
    const rows = await this.repo.find({ where: { parentId } });
    return rows.map((row) => row.childId);
  }

  removeEdge(childId: string, parentId: string) {
    return this.repo.delete({ childId, parentId });
  }
}
