import { slugify } from '@kb/shared';
import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { TopicParentsRepository } from '../database/topic-parents.repository';
import { TopicsRepository } from '../database/topics.repository';
import { Topic } from '../entities/topic.entity';
import { CreateTopicDto, UpdateTopicDto } from './dto';
import { wouldCreateCycle } from './topic-cycle';

@Injectable()
export class TopicsService {
  constructor(
    private readonly topics: TopicsRepository,
    private readonly parents: TopicParentsRepository,
  ) {}

  catalog() {
    return this.topics.findMany({ order: { name: 'ASC' } });
  }

  list(parentId?: string) {
    if (parentId) return this.topics.listChildren(parentId);
    return this.topics.listRoots();
  }

  async get(id: string) {
    const row = await this.require(id);
    const [parentIds, childIds] = await Promise.all([
      this.parents.parentIds(id),
      this.parents.childIds(id),
    ]);
    return { ...row, parentIds, childIds };
  }

  async create(dto: CreateTopicDto) {
    try {
      const topic = new Topic();
      topic.name = dto.name;
      topic.slug = slugify(dto.name);
      const saved = await this.topics.save(topic);
      for (const parentId of dto.parentIds ?? []) {
        await this.addParent(saved.id, parentId);
      }
      return this.get(saved.id);
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async update(id: string, dto: UpdateTopicDto) {
    const row = await this.require(id);
    try {
      if (dto.name !== undefined) {
        row.name = dto.name;
        row.slug = slugify(dto.name);
      }
      await this.topics.save(row);
      return this.get(id);
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async addParent(childId: string, parentId: string) {
    await this.require(childId);
    await this.require(parentId, 'Parent topic not found');
    if (await this.parents.exists(childId, parentId)) {
      throw AppError.conflict('Parent edge already exists');
    }
    const edges = await this.parents.listEdges();
    if (wouldCreateCycle(childId, parentId, edges)) {
      throw AppError.cycle();
    }
    try {
      await this.parents.add(childId, parentId);
    } catch (e) {
      if (this.parents.isUniqueViolation(e)) {
        throw AppError.conflict('Parent edge already exists');
      }
      throw e;
    }
    return this.get(childId);
  }

  async removeParent(childId: string, parentId: string) {
    await this.require(childId);
    await this.parents.removeEdge(childId, parentId);
  }

  async remove(id: string) {
    await this.require(id);
    await this.topics.deleteById(id);
  }

  searchByName(q: string) {
    return this.topics.searchByName(q);
  }

  listNames() {
    return this.topics.listNames(40);
  }

  private async require(id: string, message = 'Topic not found') {
    const row = await this.topics.findById(id);
    if (!row) throw AppError.notFound(message);
    return row;
  }

  private rethrowUnique(e: unknown) {
    if (this.topics.isUniqueViolation(e) || this.parents.isUniqueViolation(e)) {
      throw AppError.conflict('Topic slug already exists');
    }
  }
}
