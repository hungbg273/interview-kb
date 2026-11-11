import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { AiProvider } from '@kb/shared';
export type ChatTurn = {
  id: string;
  question: string;
  answer: string;
  provider: AiProvider;
  createdAt: string;
};
@Entity({ name: 'note_chat' })
export class NoteChat {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', name: 'user_id' }) userId: string;
  @Column({ type: 'uuid', name: 'note_id' }) noteId: string;
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" }) turns: ChatTurn[];
  @Column({ type: 'integer', default: 0 }) revision: number;
  @Column({ type: 'uuid', name: 'pending_id', nullable: true }) pendingId:
    string | null;
  @Column({ type: 'timestamptz', name: 'pending_at', nullable: true })
  pendingAt: Date | null;
}
