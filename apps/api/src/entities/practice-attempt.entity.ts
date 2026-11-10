import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AiProvider, AttemptStatus } from '@kb/shared';
import type { PracticeAttemptQuestion } from './practice-attempt-question.entity';
@Entity('practice_attempt')
export class PracticeAttempt {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', name: 'user_id' }) userId: string;
  @Column({ type: 'text' }) owner: string;
  @Column({ type: 'text', name: 'request_key' }) requestKey: string;
  @Column({ type: 'text', name: 'payload_hash' }) payloadHash: string;
  @Column({ type: 'varchar' }) status: AttemptStatus;
  @Column({ type: 'varchar', nullable: true }) provider: AiProvider | null;
  @Column({ type: 'varchar' }) lang: 'en' | 'vi';
  @Column({ type: 'jsonb', nullable: true }) binding: {
    model?: string;
    expectedConnection?: string;
  } | null;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
  items: PracticeAttemptQuestion[];
}
