import type { MigrationInterface, QueryRunner } from 'typeorm';
export class PracticeEssays1760000000010 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`ALTER TABLE question ADD COLUMN type varchar NOT NULL DEFAULT 'mcq', ADD COLUMN reference_answer text, ADD COLUMN rubric jsonb;
      ALTER TABLE question ALTER COLUMN choice_a DROP NOT NULL, ALTER COLUMN choice_b DROP NOT NULL, ALTER COLUMN choice_c DROP NOT NULL, ALTER COLUMN choice_d DROP NOT NULL, ALTER COLUMN correct_choice DROP NOT NULL;
      ALTER TABLE question ADD CONSTRAINT question_variant CHECK (
        (type='mcq' AND choice_a IS NOT NULL AND choice_b IS NOT NULL AND choice_c IS NOT NULL AND choice_d IS NOT NULL AND correct_choice IS NOT NULL AND reference_answer IS NULL AND rubric IS NULL)
        OR (type='essay' AND choice_a IS NULL AND choice_b IS NULL AND choice_c IS NULL AND choice_d IS NULL AND correct_choice IS NULL AND reference_answer IS NOT NULL AND rubric IS NOT NULL AND jsonb_typeof(rubric)='array'));
      CREATE TABLE practice_attempt (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        owner text NOT NULL, request_key text NOT NULL, payload_hash text NOT NULL, status varchar NOT NULL,
        provider varchar, lang varchar NOT NULL, binding jsonb, created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id,request_key));
      CREATE INDEX practice_attempt_pending ON practice_attempt(created_at) WHERE status='submitting';
      CREATE TABLE practice_attempt_question (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL REFERENCES practice_attempt(id) ON DELETE CASCADE,
        position int NOT NULL, snapshot jsonb NOT NULL, answer jsonb, revision int NOT NULL DEFAULT 0,
        state varchar NOT NULL, job_id uuid, result jsonb, UNIQUE(attempt_id,position));
      CREATE INDEX practice_item_job ON practice_attempt_question(job_id) WHERE job_id IS NOT NULL;`);
  }
  async down(q: QueryRunner) {
    // Refuse lossy rollback rather than silently deleting essay questions.
    await q.query(
      `DO $$ BEGIN IF EXISTS(SELECT 1 FROM question WHERE type='essay') THEN RAISE EXCEPTION 'Remove/export essays before rollback'; END IF; END $$;`,
    );
    await q.query(`DROP TABLE practice_attempt_question; DROP TABLE practice_attempt;
      ALTER TABLE question DROP CONSTRAINT question_variant;
      ALTER TABLE question ALTER COLUMN choice_a SET NOT NULL, ALTER COLUMN choice_b SET NOT NULL, ALTER COLUMN choice_c SET NOT NULL, ALTER COLUMN choice_d SET NOT NULL, ALTER COLUMN correct_choice SET NOT NULL;
      ALTER TABLE question DROP COLUMN type, DROP COLUMN reference_answer, DROP COLUMN rubric;`);
  }
}
