import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NoteTag } from './note-tag.entity';
import { Question } from './question.entity';
import { Topic } from './topic.entity';

@Entity({ name: 'note' })
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', name: 'body_markdown' })
  bodyMarkdown: string;

  @Column({ type: 'uuid', nullable: true, name: 'topic_id' })
  topicId: string | null;

  @ManyToOne(() => Topic, (topic) => topic.notes, { nullable: true })
  @JoinColumn({ name: 'topic_id' })
  topic: Topic | null;

  @OneToMany(() => NoteTag, (noteTag) => noteTag.note)
  noteTags: NoteTag[];

  @OneToMany(() => Question, (question) => question.note)
  questions: Question[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
