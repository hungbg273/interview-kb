import type {
  CorrectChoice,
  QuestionSource,
  RubricCriterion,
} from '@kb/shared';
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

  @Column({ type: 'varchar', default: 'mcq' })
  type: 'mcq' | 'essay';

  @Column({ type: 'text', nullable: true, name: 'reference_answer' })
  referenceAnswer: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rubric: RubricCriterion[] | null;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'varchar', name: 'choice_a', length: 2000, nullable: true })
  choiceA: string | null;

  @Column({ type: 'varchar', name: 'choice_b', length: 2000, nullable: true })
  choiceB: string | null;

  @Column({ type: 'varchar', name: 'choice_c', length: 2000, nullable: true })
  choiceC: string | null;

  @Column({ type: 'varchar', name: 'choice_d', length: 2000, nullable: true })
  choiceD: string | null;

  @Column({
    type: 'enum',
    enum: ['A', 'B', 'C', 'D'],
    enumName: 'question_correct_choice',
    name: 'correct_choice',
    nullable: true,
  })
  correctChoice: CorrectChoice | null;

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
