import { MigrationInterface, QueryRunner } from 'typeorm';
export class PersonalLibraries1760000000008 implements MigrationInterface {
  name = 'PersonalLibraries1760000000008';
  async up(q: QueryRunner) {
    await q.query(
      `CREATE TABLE app_user(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE,display_name varchar(80) NOT NULL DEFAULT 'Thành viên',created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      'ALTER TABLE note ADD COLUMN user_id uuid REFERENCES app_user(id), ADD COLUMN source_publication jsonb',
    );
    await q.query(
      'ALTER TABLE topic ADD COLUMN user_id uuid REFERENCES app_user(id)',
    );
    await q.query(
      'ALTER TABLE question ADD COLUMN user_id uuid REFERENCES app_user(id)',
    );
    const [{ count }] = await q.query(
      'SELECT (SELECT count(*) FROM note)+(SELECT count(*) FROM topic) AS count',
    );
    if (Number(count) > 0) {
      const email = process.env.LEGACY_OWNER_EMAIL?.trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error(
          'Set LEGACY_OWNER_EMAIL explicitly before migrating existing shared data.',
        );
      const [user] = await q.query(
        'INSERT INTO app_user(email) VALUES($1) RETURNING id',
        [email],
      );
      await q.query('UPDATE note SET user_id=$1', [user.id]);
      await q.query('UPDATE topic SET user_id=$1', [user.id]);
    }
    await q.query(
      'UPDATE question q SET user_id=n.user_id FROM note n WHERE n.id=q.note_id',
    );
    for (const table of ['note', 'topic', 'question']) {
      await q.query(`ALTER TABLE ${table} ALTER COLUMN user_id SET NOT NULL`);
      await q.query(`CREATE INDEX ${table}_user_idx ON ${table}(user_id)`);
      await q.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_id_user_unique UNIQUE(id,user_id)`,
      );
    }
    await q.query('ALTER TABLE topic DROP CONSTRAINT IF EXISTS topic_slug_key');
    await q.query(
      'ALTER TABLE topic ADD CONSTRAINT topic_user_slug_unique UNIQUE(user_id,slug)',
    );
    await q.query(
      'ALTER TABLE question ADD CONSTRAINT question_owned_note_fk FOREIGN KEY(note_id,user_id) REFERENCES note(id,user_id) ON DELETE CASCADE',
    );
    await q.query(`CREATE FUNCTION verify_personal_relation() RETURNS trigger LANGUAGE plpgsql AS $$
   DECLARE left_owner uuid; right_owner uuid;
   BEGIN
    IF TG_TABLE_NAME='note_topic' THEN
     SELECT user_id INTO left_owner FROM note WHERE id=NEW.note_id;
     SELECT user_id INTO right_owner FROM topic WHERE id=NEW.topic_id;
    ELSE
     SELECT user_id INTO left_owner FROM topic WHERE id=NEW.parent_id;
     SELECT user_id INTO right_owner FROM topic WHERE id=NEW.child_id;
    END IF;
    IF left_owner IS DISTINCT FROM right_owner THEN RAISE EXCEPTION 'Cross-account relation' USING ERRCODE='23514'; END IF;
    RETURN NEW;
   END $$`);
    for (const table of ['note_topic', 'topic_parent'])
      await q.query(
        `CREATE TRIGGER ${table}_owner_check BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION verify_personal_relation()`,
      );
    await q.query(
      `CREATE FUNCTION prevent_owner_transfer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Owner cannot change' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
    );
    for (const table of ['note', 'topic', 'question'])
      await q.query(
        `CREATE TRIGGER ${table}_immutable_owner BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION prevent_owner_transfer()`,
      );
    await q.query(
      `CREATE TABLE note_publication(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),note_id uuid NOT NULL UNIQUE REFERENCES note(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES app_user(id),title varchar(200) NOT NULL,body_markdown text NOT NULL CHECK(char_length(body_markdown)<=100000),is_published boolean NOT NULL DEFAULT true,published_at timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      'ALTER TABLE note_publication ADD CONSTRAINT publication_owned_note_fk FOREIGN KEY(note_id,user_id) REFERENCES note(id,user_id) ON DELETE CASCADE',
    );
    await q.query(
      'CREATE INDEX publication_feed_idx ON note_publication(published_at DESC,id DESC) WHERE is_published',
    );
    await q.query(
      `CREATE TABLE library_clone(user_id uuid NOT NULL REFERENCES app_user(id),publication_id uuid NOT NULL REFERENCES note_publication(id) ON DELETE CASCADE,note_id uuid NOT NULL REFERENCES note(id) ON DELETE CASCADE,PRIMARY KEY(user_id,publication_id))`,
    );
    await q.query(
      'ALTER TABLE library_clone ADD CONSTRAINT clone_owned_note_fk FOREIGN KEY(note_id,user_id) REFERENCES note(id,user_id) ON DELETE CASCADE',
    );
  }
  async down(): Promise<void> {
    throw new Error(
      'Personal-library ownership cannot be safely removed automatically. Restore a backup to roll back.',
    );
  }
}
