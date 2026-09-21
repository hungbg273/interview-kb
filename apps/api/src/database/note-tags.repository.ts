import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NoteTag } from '../entities/note-tag.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class NoteTagsRepository extends BaseRepository<NoteTag> {
  constructor(dataSource: DataSource) {
    super(NoteTag, dataSource);
  }

  countByTag(tagId: string) {
    return this.repo.count({ where: { tagId } });
  }

  async replaceForNote(noteId: string, tagIds: string[]) {
    await this.repo.manager.transaction(async (manager) => {
      await manager.delete(NoteTag, { noteId });
      if (tagIds.length === 0) {
        return;
      }
      await manager.save(
        NoteTag,
        tagIds.map((tagId) => manager.create(NoteTag, { noteId, tagId })),
      );
    });
  }
}
