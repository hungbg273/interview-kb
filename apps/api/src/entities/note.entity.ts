import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';
import { NoteTag } from './note-tag.entity';
import { Question } from './question.entity';
import { Topic } from './topic.entity';

@Check('note_body_markdown_length', 'char_length(body_markdown) <= 100000')
@Entity({ name: 'note' })
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', name: 'body_markdown' })
  bodyMarkdown: string;

  @ManyToOne(() => Topic, (topic) => topic.notes, { nullable: true })
  @JoinColumn({ name: 'topic_id' })
  topic: Topic | null;

  @RelationId((note: Note) => note.topic)
  topicId: string | null;

  @OneToMany(() => NoteTag, (noteTag) => noteTag.note)
  noteTags: NoteTag[];

  @OneToMany(() => Question, (question) => question.note)
  questions: Question[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
