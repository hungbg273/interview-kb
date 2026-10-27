import { MigrationInterface, QueryRunner } from 'typeorm';
export class AiJobs1760000000006 implements MigrationInterface {
  name = 'AiJobs1760000000006';
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE ai_job (
   id uuid PRIMARY KEY, owner text NOT NULL, note_id uuid NOT NULL, note_title text NOT NULL,
   idempotency_key uuid NOT NULL, payload_hash text NOT NULL, action text NOT NULL, provider text NOT NULL,
   status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','retrying','succeeded','failed')),
   stage text NOT NULL DEFAULT 'waiting', revision integer NOT NULL DEFAULT 1, attempts integer NOT NULL DEFAULT 0,
   input jsonb NOT NULL, output jsonb, result jsonb, error jsonb,
   source_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
   expires_at timestamptz NOT NULL, result_expires_at timestamptz NOT NULL, UNIQUE(owner,idempotency_key)
  )`);
    await q.query(
      `CREATE INDEX ai_job_owner_created ON ai_job(owner,created_at DESC)`,
    );
    await q.query(
      `CREATE TABLE ai_job_dispatch (job_id uuid PRIMARY KEY REFERENCES ai_job(id) ON DELETE CASCADE, dispatched_at timestamptz)`,
    );
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE ai_job_dispatch');
    await q.query('DROP TABLE ai_job');
  }
}
