import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';
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
    return this.repo
      .createQueryBuilder('tp')
      .innerJoin('tp.child', 'topic')
      .select(['tp.parentId', 'tp.childId'])
      .where('topic.user_id=:userId', { userId: currentAccount().id })
      .getMany();
  }

  exists(childId: string, parentId: string) {
    return this.repo.exists({ where: { childId, parentId } });
  }

  async add(childId: string, parentId: string) {
    const [row] = await this.repo.query(
      'SELECT count(*)::int AS count FROM topic WHERE id=ANY($1::uuid[]) AND user_id=$2',
      [[...new Set([childId, parentId])], currentAccount().id],
    );
    if (row.count !== new Set([childId, parentId]).size)
      throw AppError.notFound();
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
