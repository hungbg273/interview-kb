import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NoteTopic } from '../entities/note-topic.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class NoteTopicsRepository extends BaseRepository<NoteTopic> {
  constructor(dataSource: DataSource) {
    super(NoteTopic, dataSource);
  }

  async add(noteId: string, topicId: string) {
    const existing = await this.repo.findOne({ where: { noteId, topicId } });
    if (existing) return;
    await this.repo.save(this.repo.create({ noteId, topicId }));
  }

  async replaceForNote(noteId: string, topicIds: string[]) {
    const unique = [...new Set(topicIds)];
    await this.repo.manager.transaction(async (manager) => {
      await manager.delete(NoteTopic, { noteId });
      if (unique.length === 0) return;
      await manager.save(
        NoteTopic,
        unique.map((topicId) => manager.create(NoteTopic, { noteId, topicId })),
      );
    });
  }
}
