import { slugify } from '@kb/shared';
import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { NoteTagsRepository } from '../database/note-tags.repository';
import { TagsRepository } from '../database/tags.repository';
import { Tag } from '../entities/tag.entity';
import { CreateTagDto, UpdateTagDto } from './dto';

@Injectable()
export class TagsService {
  constructor(
    private readonly tags: TagsRepository,
    private readonly noteTags: NoteTagsRepository,
  ) {}

  list() {
    return this.tags.list();
  }

  async get(id: string) {
    return this.require(id);
  }

  async create(dto: CreateTagDto) {
    try {
      const tag = new Tag();
      tag.name = dto.name;
      tag.slug = slugify(dto.name);
      return await this.tags.save(tag);
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async update(id: string, dto: UpdateTagDto) {
    const row = await this.require(id);
    try {
      if (dto.name !== undefined) {
        row.name = dto.name;
        row.slug = slugify(dto.name);
      }
      return await this.tags.save(row);
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async remove(id: string) {
    await this.require(id);
    const attached = await this.noteTags.countByTag(id);
    if (attached > 0) {
      throw AppError.conflict('Tag is still attached to notes');
    }
    await this.tags.deleteById(id);
  }

  private async require(id: string) {
    const row = await this.tags.findById(id);
    if (!row) throw AppError.notFound('Tag not found');
    return row;
  }

  private rethrowUnique(e: unknown) {
    if (this.tags.isUniqueViolation(e)) {
      throw AppError.conflict('Tag name or slug already exists');
    }
  }
}
