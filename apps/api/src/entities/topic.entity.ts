import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';
import { Note } from './note.entity';

@Entity({ name: 'topic' })
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  slug: string;

  @ManyToOne(() => Topic, (topic) => topic.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Topic | null;

  @RelationId((topic: Topic) => topic.parent)
  parentId: string | null;

  @OneToMany(() => Topic, (topic) => topic.parent)
  children: Topic[];

  @OneToMany(() => Note, (note) => note.topic)
  notes: Note[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
