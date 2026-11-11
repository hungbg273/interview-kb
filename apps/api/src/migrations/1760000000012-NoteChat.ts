import { MigrationInterface, QueryRunner } from 'typeorm';
export class NoteChat1760000000012 implements MigrationInterface {
  name = 'NoteChat1760000000012';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE note_chat (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      note_id uuid NOT NULL UNIQUE,
      turns jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(turns) = 'array' AND jsonb_array_length(turns) <= 50),
      revision integer NOT NULL DEFAULT 0 CHECK(revision >= 0),
      pending_id uuid, pending_at timestamptz,
      CONSTRAINT chat_owned_note_fk FOREIGN KEY(note_id,user_id) REFERENCES note(id,user_id) ON DELETE CASCADE
    )`);
    await q.query('CREATE INDEX note_chat_user_idx ON note_chat(user_id)');
    await q.query(
      'CREATE TRIGGER note_chat_immutable_owner BEFORE UPDATE ON note_chat FOR EACH ROW EXECUTE FUNCTION prevent_owner_transfer()',
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE note_chat');
  }
}
