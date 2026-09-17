import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
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

  @Column({ type: 'uuid', nullable: true, name: 'parent_id' })
  parentId: string | null;

  @ManyToOne(() => Topic, (topic) => topic.children, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Topic | null;

  @OneToMany(() => Topic, (topic) => topic.parent)
  children: Topic[];

  @OneToMany(() => Note, (note) => note.topic)
  notes: Note[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
