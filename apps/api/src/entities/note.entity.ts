import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NoteTopic } from './note-topic.entity';
import { Question } from './question.entity';

@Check('note_body_markdown_length', 'char_length(body_markdown) <= 100000')
@Entity({ name: 'note' })
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', name: 'body_markdown' })
  bodyMarkdown: string;

  @OneToMany(() => NoteTopic, (noteTopic) => noteTopic.note)
  noteTopics: NoteTopic[];

  @OneToMany(() => Question, (question) => question.note)
  questions: Question[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
