import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { NoteTopicsRepository } from '../database/note-topics.repository';
import { NotesRepository } from '../database/notes.repository';
import { TopicsRepository } from '../database/topics.repository';
import { Note } from '../entities/note.entity';
import { CreateNoteDto, ListNotesQuery, UpdateNoteDto } from './dto';

@Injectable()
export class NotesService {
  constructor(
    private readonly notes: NotesRepository,
    private readonly topics: TopicsRepository,
    private readonly noteTopics: NoteTopicsRepository,
  ) {}

  async create(dto: CreateNoteDto) {
    this.assertLimits(dto.title, dto.bodyMarkdown);
    const note = new Note();
    note.title = dto.title;
    note.bodyMarkdown = dto.bodyMarkdown;
    const saved = await this.notes.save(note);
    if (dto.topicIds?.length) {
      await this.replaceTopics(saved.id, dto.topicIds);
    }
    return this.get(saved.id);
  }

  async list(query: ListNotesQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const items = await this.notes.list({
      topicId: query.topicId,
      uncategorized: query.uncategorized,
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
    if (dto.title !== undefined) row.title = dto.title;
    if (dto.bodyMarkdown !== undefined) row.bodyMarkdown = dto.bodyMarkdown;
    await this.notes.save(row);
    if (dto.topicIds) {
      await this.replaceTopics(id, dto.topicIds);
    }
    return this.get(id);
  }

  async remove(id: string) {
    await this.require(id);
    await this.notes.deleteById(id);
  }

  async replaceTopics(id: string, topicIds: string[]) {
    await this.require(id);
    for (const topicId of topicIds) {
      const topic = await this.topics.findById(topicId);
      if (!topic) throw AppError.validation('Unknown topic id');
    }
    await this.noteTopics.replaceForNote(id, topicIds);
    return this.get(id);
  }

  searchByTitle(q: string) {
    return this.notes.searchByTitle(q);
  }

  private async require(id: string) {
    const row = await this.notes.findById(id);
    if (!row) throw AppError.notFound('Note not found');
    return row;
  }

  private assertLimits(title: string, bodyMarkdown: string) {
    if (title.length > 200) throw AppError.validation('Title too long');
    if (bodyMarkdown.length > 100000) throw AppError.validation('Body too long');
  }

  private toPublic(note: Note) {
    const { noteTopics, ...rest } = note;
    const topics = (noteTopics ?? [])
      .map((link) => link.topic)
      .filter(Boolean)
      .map((topic) => ({ id: topic.id, name: topic.name }));
    return {
      ...rest,
      topics,
      topicIds: topics.map((topic) => topic.id),
    };
  }
}
