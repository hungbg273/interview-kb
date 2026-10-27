import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NoteTopic } from '../entities/note-topic.entity';
import { BaseRepository } from './base.repository';

@Injectable()
export class NoteTopicsRepository extends BaseRepository<NoteTopic> {
  constructor(dataSource: DataSource) {
    super(NoteTopic, dataSource);
  }

  private async assertOwned(noteId: string, topicIds: string[]) {
    const userId = currentAccount().id;
    const [note] = await this.repo.query(
      'SELECT id FROM note WHERE id=$1 AND user_id=$2',
      [noteId, userId],
    );
    if (!note) throw AppError.notFound();
    const [count] = await this.repo.query(
      'SELECT count(*)::int AS count FROM topic WHERE id=ANY($1::uuid[]) AND user_id=$2',
      [[...new Set(topicIds)], userId],
    );
    if (count.count !== new Set(topicIds).size) throw AppError.notFound();
  }
  async add(noteId: string, topicId: string) {
    await this.assertOwned(noteId, [topicId]);
    const existing = await this.repo.findOne({ where: { noteId, topicId } });
    if (existing) return;
    await this.repo.save(this.repo.create({ noteId, topicId }));
  }

  async replaceForNote(noteId: string, topicIds: string[]) {
    await this.assertOwned(noteId, topicIds);
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
