import { MigrationInterface, QueryRunner } from 'typeorm';
export class Interviews1760000000009 implements MigrationInterface {
  name = 'Interviews1760000000009';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE interview_session (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
      payload jsonb NOT NULL,
      credential_count integer NOT NULL DEFAULT 0 CHECK (credential_count BETWEEN 0 AND 3),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT interview_payload_valid CHECK (payload->>'status' IN ('active','finished') AND payload->>'id'=id::text)
    )`);
    await q.query(
      'CREATE INDEX interview_session_owner_idx ON interview_session(user_id,created_at DESC)',
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE interview_session');
  }
}
