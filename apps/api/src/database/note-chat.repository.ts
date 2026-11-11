import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { currentAccount } from '../accounts/account-context';
import { NoteChat, type ChatTurn } from '../entities/note-chat.entity';
import { BaseRepository } from './base.repository';
@Injectable()
export class NoteChatRepository extends BaseRepository<NoteChat> {
  constructor(dataSource: DataSource) {
    super(NoteChat, dataSource, true);
  }
  async get(noteId: string) {
    return (await this.findMany({ where: { noteId }, take: 1 }))[0] ?? null;
  }
  async claim(noteId: string, requestId: string, revision: number) {
    const owner = currentAccount().id;
    await this.repo.query(
      `INSERT INTO note_chat(note_id,user_id) SELECT id,user_id FROM note WHERE id=$1 AND user_id=$2 ON CONFLICT(note_id) DO NOTHING`,
      [noteId, owner],
    );
    const rows = await this.repo.query(
      `WITH changed AS (UPDATE note_chat SET pending_id=$3,pending_at=now()
      WHERE note_id=$1 AND user_id=$2 AND revision=$4 AND jsonb_array_length(turns)<50
      AND (pending_id IS NULL OR pending_at < now()-interval '3 minutes') RETURNING id) SELECT id FROM changed`,
      [noteId, owner, requestId, revision],
    );
    return rows.length > 0;
  }
  async finish(noteId: string, requestId: string, turn: ChatTurn) {
    const rows = await this.repo.query(
      `WITH changed AS (UPDATE note_chat SET turns=turns || $4::jsonb,revision=revision+1,pending_id=NULL,pending_at=NULL
      WHERE note_id=$1 AND user_id=$2 AND pending_id=$3 RETURNING id) SELECT id FROM changed`,
      [noteId, currentAccount().id, requestId, JSON.stringify([turn])],
    );
    return rows.length > 0;
  }
  async release(noteId: string, requestId: string) {
    await this.repo.query(
      'UPDATE note_chat SET pending_id=NULL,pending_at=NULL WHERE note_id=$1 AND user_id=$2 AND pending_id=$3',
      [noteId, currentAccount().id, requestId],
    );
  }
  async reset(noteId: string, revision: number) {
    const rows = await this.repo.query(
      `WITH changed AS (UPDATE note_chat SET turns='[]'::jsonb,revision=revision+1,pending_id=NULL,pending_at=NULL
      WHERE note_id=$1 AND user_id=$2 AND revision=$3 AND (pending_id IS NULL OR pending_at < now()-interval '3 minutes') RETURNING id) SELECT id FROM changed`,
      [noteId, currentAccount().id, revision],
    );
    return rows.length > 0;
  }
}
