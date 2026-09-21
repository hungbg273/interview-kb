import { slugify } from '@kb/shared';
import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { NotesRepository } from '../database/notes.repository';
import { TopicsRepository } from '../database/topics.repository';
import { Topic } from '../entities/topic.entity';
import { CreateTopicDto, UpdateTopicDto } from './dto';

@Injectable()
export class TopicsService {
  constructor(
    private readonly topics: TopicsRepository,
    private readonly notes: NotesRepository,
  ) {}

  list() {
    return this.topics.list();
  }

  async get(id: string) {
    return this.require(id);
  }

  async create(dto: CreateTopicDto) {
    if (dto.parentId) {
      await this.require(dto.parentId, 'Parent topic not found');
    }
    try {
      const topic = new Topic();
      topic.name = dto.name;
      topic.slug = slugify(dto.name);
      topic.parent = dto.parentId ? ({ id: dto.parentId } as Topic) : null;
      return await this.topics.save(topic);
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async update(id: string, dto: UpdateTopicDto) {
    const row = await this.require(id);
    if (dto.parentId) {
      await this.require(dto.parentId, 'Parent topic not found');
    }
    try {
      if (dto.name !== undefined) {
        row.name = dto.name;
        row.slug = slugify(dto.name);
      }
      if (dto.parentId !== undefined) {
        row.parent = dto.parentId ? ({ id: dto.parentId } as Topic) : null;
      }
      return await this.topics.save(row);
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async remove(id: string) {
    await this.require(id);
    const children = await this.topics.countChildren(id);
    if (children > 0) {
      throw AppError.conflict('Topic has child topics');
    }
    const notes = await this.notes.countByTopic(id);
    if (notes > 0) {
      throw AppError.conflict('Topic still has notes');
    }
    await this.topics.deleteById(id);
  }

  private async require(id: string, message = 'Topic not found') {
    const row = await this.topics.findById(id);
    if (!row) throw AppError.notFound(message);
    return row;
  }

  private rethrowUnique(e: unknown) {
    if (this.topics.isUniqueViolation(e)) {
      throw AppError.conflict('Topic slug already exists');
    }
  }
}
