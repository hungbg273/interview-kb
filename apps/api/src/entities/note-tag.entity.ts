import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Note } from './note.entity';
import { Tag } from './tag.entity';

@Entity({ name: 'note_tag' })
export class NoteTag {
  @PrimaryColumn({ type: 'uuid', name: 'note_id' })
  noteId: string;

  @PrimaryColumn({ type: 'uuid', name: 'tag_id' })
  tagId: string;

  @ManyToOne(() => Note, (note) => note.noteTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note: Note;

  @ManyToOne(() => Tag, (tag) => tag.noteTags)
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
