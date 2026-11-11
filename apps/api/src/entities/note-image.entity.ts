import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'note_image' })
export class NoteImage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', name: 'user_id' }) userId: string;
  @Column({ type: 'varchar', length: 32, name: 'mime_type' }) mimeType: string;
  @Column({ type: 'bytea', select: false }) data: Buffer;
  @Column({ type: 'int' }) width: number;
  @Column({ type: 'int' }) height: number;
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
