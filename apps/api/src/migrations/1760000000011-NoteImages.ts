import { MigrationInterface, QueryRunner } from 'typeorm';
export class NoteImages1760000000011 implements MigrationInterface {
  name = 'NoteImages1760000000011';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE note_image (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      mime_type varchar(32) NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),
      data bytea NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 5242880),
      width integer NOT NULL CHECK(width BETWEEN 1 AND 2400),
      height integer NOT NULL CHECK(height BETWEEN 1 AND 2400),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query('CREATE INDEX note_image_user_idx ON note_image(user_id)');
    await q.query(
      'CREATE INDEX publication_image_owner_idx ON note_publication(user_id) WHERE is_published',
    );
    await q.query(
      'CREATE TRIGGER note_image_immutable_owner BEFORE UPDATE ON note_image FOR EACH ROW EXECUTE FUNCTION prevent_owner_transfer()',
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP INDEX publication_image_owner_idx');
    await q.query('DROP TABLE note_image');
  }
}
