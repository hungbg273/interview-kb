import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { currentAccount } from '../accounts/account-context';
import { NoteImage } from '../entities/note-image.entity';
import { BaseRepository } from './base.repository';
import { AppError } from '../common/app-error';

const IMAGE_REFERENCE =
  /\/note-images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f-])/gi;

@Injectable()
export class NoteImagesRepository extends BaseRepository<NoteImage> {
  constructor(db: DataSource) {
    super(NoteImage, db, true);
  }

  async readable(id: string): Promise<NoteImage | null> {
    // Publication references are authorized only when the publisher owns the bytes.
    // Copying another person's private image URL into Markdown cannot grant access.
    const [row] = await this.repo.query(
      `SELECT i.id,i.mime_type AS "mimeType",i.data,i.width,i.height
      FROM note_image i WHERE i.id=$1 AND (i.user_id=$2 OR EXISTS (
        SELECT 1 FROM note_publication p WHERE p.user_id=i.user_id AND p.is_published
        AND strpos(lower(p.body_markdown), '/note-images/' || i.id::text)>0
      ))`,
      [id, currentAccount().id],
    );
    return row ?? null;
  }

  async cloneReferences(
    manager: EntityManager,
    markdown: string,
    sourceOwner: string,
    recipient: string,
  ) {
    const ids = [
      ...new Set(
        [...markdown.matchAll(IMAGE_REFERENCE)].map((match) =>
          match[1].toLowerCase(),
        ),
      ),
    ];
    const replacements = new Map<string, string>();
    for (const id of ids) {
      const [copy] = await manager.query(
        `INSERT INTO note_image(user_id,mime_type,data,width,height)
        SELECT $1,mime_type,data,width,height FROM note_image WHERE id=$2 AND user_id=$3 RETURNING id`,
        [recipient, id, sourceOwner],
      );
      if (!copy)
        throw AppError.validation(
          'Ghi chú chứa ảnh không thuộc tác giả hoặc đã bị xóa.',
        );
      replacements.set(id, copy.id);
    }
    return markdown.replace(
      IMAGE_REFERENCE,
      (_match, id: string) =>
        `/note-images/${replacements.get(id.toLowerCase())!}`,
    );
  }
}
