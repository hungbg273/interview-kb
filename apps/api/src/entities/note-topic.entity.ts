import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Note } from './note.entity';
import { Topic } from './topic.entity';

@Entity({ name: 'note_topic' })
export class NoteTopic {
  @PrimaryColumn({ type: 'uuid', name: 'note_id' })
  noteId: string;

  @PrimaryColumn({ type: 'uuid', name: 'topic_id' })
  topicId: string;

  @ManyToOne(() => Note, (note) => note.noteTopics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note: Note;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: Topic;
}
