import type { CorrectChoice, QuestionSource } from '@kb/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Note } from './note.entity';

@Entity({ name: 'question' })
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'note_id' })
  noteId: string;

  @ManyToOne(() => Note, (note) => note.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note: Note;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'varchar', name: 'choice_a', length: 2000 })
  choiceA: string;

  @Column({ type: 'varchar', name: 'choice_b', length: 2000 })
  choiceB: string;

  @Column({ type: 'varchar', name: 'choice_c', length: 2000 })
  choiceC: string;

  @Column({ type: 'varchar', name: 'choice_d', length: 2000 })
  choiceD: string;

  @Column({ type: 'enum', enum: ['A', 'B', 'C', 'D'], name: 'correct_choice' })
  correctChoice: CorrectChoice;

  @Column({ type: 'text', nullable: true, name: 'explanation_markdown' })
  explanationMarkdown: string | null;

  @Column({ type: 'enum', enum: ['manual', 'ai'] })
  source: QuestionSource;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
