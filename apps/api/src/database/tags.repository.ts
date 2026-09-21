import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Tag } from '../entities/tag.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class TagsRepository extends BaseRepository<Tag> {
  constructor(dataSource: DataSource) {
    super(Tag, dataSource);
  }

  list() {
    return this.repo.find({ order: { name: 'ASC' } });
  }
}
