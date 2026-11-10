import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type {
  GradeResult,
  PracticeAnswer,
  PracticeItemState,
  QuestionInput,
} from '@kb/shared';
@Entity('practice_attempt_question')
export class PracticeAttemptQuestion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', name: 'attempt_id' }) attemptId: string;
  @Column({ type: 'int' }) position: number;
  @Column({ type: 'jsonb' }) snapshot: QuestionInput;
  @Column({ type: 'jsonb', nullable: true }) answer: PracticeAnswer | null;
  @Column({ type: 'int', default: 0 }) revision: number;
  @Column({ type: 'varchar' }) state: PracticeItemState;
  @Column({ type: 'uuid', nullable: true, name: 'job_id' }) jobId:
    string | null;
  @Column({ type: 'jsonb', nullable: true }) result: GradeResult | null;
}
