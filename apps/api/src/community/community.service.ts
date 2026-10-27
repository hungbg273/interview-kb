import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';
@Injectable()
export class CommunityService {
  constructor(private readonly db: DataSource) {}
  async list(page = 1) {
    const items = await this.db.query(
      `SELECT p.id,p.title,p.published_at AS "publishedAt",u.display_name AS author,EXISTS(SELECT 1 FROM library_clone c WHERE c.publication_id=p.id AND c.user_id=$1) AS saved FROM note_publication p JOIN app_user u ON u.id=p.user_id WHERE p.is_published AND p.user_id<>$1 ORDER BY p.published_at DESC,p.id DESC LIMIT 21 OFFSET $2`,
      [currentAccount().id, (page - 1) * 20],
    );
    return { items: items.slice(0, 20), page, hasMore: items.length > 20 };
  }
  async detail(id: string) {
    const [row] = await this.db.query(
      `SELECT p.id,p.title,p.body_markdown AS "bodyMarkdown",p.published_at AS "publishedAt",u.display_name AS author,EXISTS(SELECT 1 FROM library_clone c WHERE c.publication_id=p.id AND c.user_id=$2) AS saved FROM note_publication p JOIN app_user u ON u.id=p.user_id WHERE p.id=$1 AND p.is_published`,
      [id, currentAccount().id],
    );
    if (!row) throw AppError.notFound('Ghi chú đã được gỡ hoặc không tồn tại.');
    return row;
  }
  async status(noteId: string) {
    const [note] = await this.db.query(
      'SELECT id FROM note WHERE id=$1 AND user_id=$2',
      [noteId, currentAccount().id],
    );
    if (!note) throw AppError.notFound();
    const [row] = await this.db.query(
      'SELECT id,is_published AS published,published_at AS "publishedAt" FROM note_publication WHERE note_id=$1 AND user_id=$2',
      [noteId, currentAccount().id],
    );
    return row ?? { published: false };
  }
  async publish(noteId: string) {
    return this.db.transaction(async (m) => {
      const userId = currentAccount().id;
      const [note] = await m.query(
        'SELECT * FROM note WHERE id=$1 AND user_id=$2 FOR SHARE',
        [noteId, userId],
      );
      if (!note) throw AppError.notFound();
      const [row] = await m.query(
        `INSERT INTO note_publication(note_id,user_id,title,body_markdown) VALUES($1,$2,$3,$4) ON CONFLICT(note_id) DO UPDATE SET title=EXCLUDED.title,body_markdown=EXCLUDED.body_markdown,is_published=true,published_at=now() WHERE note_publication.user_id=$2 RETURNING id,is_published AS published,published_at AS "publishedAt"`,
        [noteId, userId, note.title, note.body_markdown],
      );
      return row;
    });
  }
  async unpublish(noteId: string) {
    await this.status(noteId);
    await this.db.query(
      'UPDATE note_publication SET is_published=false WHERE note_id=$1 AND user_id=$2',
      [noteId, currentAccount().id],
    );
    return { published: false };
  }
  async clone(id: string, topicId?: string) {
    return this.db.transaction(async (m) => {
      const userId = currentAccount().id;
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `clone:${userId}:${id}`,
      ]);
      const [publication] = await m.query(
        'SELECT p.*,u.display_name AS author FROM note_publication p JOIN app_user u ON u.id=p.user_id WHERE p.id=$1 AND p.is_published FOR SHARE OF p',
        [id],
      );
      if (!publication)
        throw AppError.notFound('Ghi chú đã được gỡ hoặc không tồn tại.');
      if (publication.user_id === userId)
        throw AppError.conflict('Đây là ghi chú của bạn.');
      if (topicId) {
        const [topic] = await m.query(
          'SELECT id FROM topic WHERE id=$1 AND user_id=$2 FOR SHARE',
          [topicId, userId],
        );
        if (!topic) throw AppError.notFound('Không tìm thấy chủ đề của bạn.');
      }
      const [existing] = await m.query(
        'SELECT note_id AS id FROM library_clone WHERE user_id=$1 AND publication_id=$2',
        [userId, id],
      );
      if (existing) return { ...existing, alreadySaved: true };
      const source = {
        publicationId: id,
        author: publication.author,
        title: publication.title,
        publishedAt: publication.published_at,
      };
      const [note] = await m.query(
        'INSERT INTO note(user_id,title,body_markdown,source_publication) VALUES($1,$2,$3,$4) RETURNING id',
        [
          userId,
          publication.title,
          publication.body_markdown,
          JSON.stringify(source),
        ],
      );
      if (topicId)
        await m.query(
          'INSERT INTO note_topic(note_id,topic_id) VALUES($1,$2)',
          [note.id, topicId],
        );
      await m.query(
        'INSERT INTO library_clone(user_id,publication_id,note_id) VALUES($1,$2,$3)',
        [userId, id, note.id],
      );
      return { ...note, alreadySaved: false };
    });
  }
}
