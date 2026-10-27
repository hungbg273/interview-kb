import {
  Column,
  Index,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NoteTopic } from './note-topic.entity';

@Index('topic_user_slug_unique', ['userId', 'slug'], { unique: true })
@Entity({ name: 'topic' })
export class Topic {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  slug: string;

  @OneToMany(() => NoteTopic, (noteTopic) => noteTopic.topic)
  noteTopics: NoteTopic[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
