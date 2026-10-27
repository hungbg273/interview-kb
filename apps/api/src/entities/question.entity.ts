import type { CorrectChoice, QuestionSource } from '@kb/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { Note } from './note.entity';

@Entity({ name: 'question' })
export class Question {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Note, (note) => note.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note: Note;

  @RelationId((question: Question) => question.note)
  noteId: string;

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

  @Column({
    type: 'enum',
    enum: ['A', 'B', 'C', 'D'],
    enumName: 'question_correct_choice',
    name: 'correct_choice',
  })
  correctChoice: CorrectChoice;

  @Column({ type: 'text', nullable: true, name: 'explanation_markdown' })
  explanationMarkdown: string | null;

  @Column({
    type: 'enum',
    enum: ['en', 'vi'],
    enumName: 'question_lang',
  })
  lang: 'en' | 'vi';

  @Column({
    type: 'enum',
    enum: ['manual', 'ai'],
    enumName: 'question_source',
  })
  source: QuestionSource;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
