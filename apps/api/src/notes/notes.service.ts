import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { NoteTagsRepository } from '../database/note-tags.repository';
import { NotesRepository } from '../database/notes.repository';
import { TagsRepository } from '../database/tags.repository';
import { TopicsRepository } from '../database/topics.repository';
import { Note } from '../entities/note.entity';
import { Topic } from '../entities/topic.entity';
import { CreateNoteDto, ListNotesQuery, UpdateNoteDto } from './dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly notes: NotesRepository,
    private readonly topics: TopicsRepository,
    private readonly tags: TagsRepository,
    private readonly noteTags: NoteTagsRepository,
  ) {}

  async create(dto: CreateNoteDto) {
    this.assertLimits(dto.title, dto.bodyMarkdown);
    if (dto.topicId) {
      await this.requireTopic(dto.topicId);
    }
    const note = new Note();
    note.title = dto.title;
    note.bodyMarkdown = dto.bodyMarkdown;
    note.topic = dto.topicId ? ({ id: dto.topicId } as Topic) : null;
    const saved = await this.notes.save(note);
    return this.get(saved.id);
  }

  async list(query: ListNotesQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const items = await this.notes.list({
      topicId: query.topicId,
      tagId: query.tagId,
      q: query.q,
      page,
      pageSize,
    });
    return { items: items.map((note) => this.toPublic(note)), page, pageSize };
  }

  async get(id: string) {
    const row = await this.notes.findDetail(id);
    if (!row) throw AppError.notFound('Note not found');
    return this.toPublic(row);
  }

  async update(id: string, dto: UpdateNoteDto) {
    const row = await this.require(id);
    if (dto.title !== undefined || dto.bodyMarkdown !== undefined) {
      this.assertLimits(
        dto.title ?? row.title,
        dto.bodyMarkdown ?? row.bodyMarkdown,
      );
    }
    if (dto.topicId) {
      await this.requireTopic(dto.topicId);
    }
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.bodyMarkdown !== undefined) row.bodyMarkdown = dto.bodyMarkdown;
    if (dto.topicId !== undefined) {
      row.topic = dto.topicId ? ({ id: dto.topicId } as Topic) : null;
    }
    await this.notes.save(row);
    return this.get(id);
  }

  async remove(id: string) {
    await this.require(id);
    await this.notes.deleteById(id);
  }

  async replaceTags(id: string, tagIds: string[]) {
    await this.require(id);
    for (const tagId of tagIds) {
      const tag = await this.tags.findById(tagId);
      if (!tag) throw AppError.notFound('Tag not found');
    }
    await this.noteTags.replaceForNote(id, tagIds);
    return this.get(id);
  }

  private async require(id: string) {
    const row = await this.notes.findById(id);
    if (!row) throw AppError.notFound('Note not found');
    return row;
  }

  private async requireTopic(id: string) {
    const topic = await this.topics.findById(id);
    if (!topic) throw AppError.notFound('Topic not found');
  }

  private assertLimits(title: string, bodyMarkdown: string) {
    if (title.length > 200) throw AppError.validation('Title too long');
    if (bodyMarkdown.length > 100000) throw AppError.validation('Body too long');
  }

  private toPublic(note: Note) {
    const { noteTags, ...rest } = note;
    return {
      ...rest,
      tags: (noteTags ?? []).map((link) => link.tag).filter(Boolean),
    };
  }
}
