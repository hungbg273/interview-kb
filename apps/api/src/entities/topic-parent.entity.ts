import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Topic } from './topic.entity';

@Entity({ name: 'topic_parent' })
export class TopicParent {
  @PrimaryColumn({ type: 'uuid', name: 'parent_id' })
  parentId: string;

  @PrimaryColumn({ type: 'uuid', name: 'child_id' })
  childId: string;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_id' })
  parent: Topic;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'child_id' })
  child: Topic;
}
