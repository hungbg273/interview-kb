import {MigrationInterface,QueryRunner} from 'typeorm';
export class ImportJobs1760000000007 implements MigrationInterface {
 name='ImportJobs1760000000007';
 async up(q:QueryRunner){await q.query('ALTER TABLE ai_job ALTER COLUMN note_id DROP NOT NULL');await q.query(`CREATE TABLE practice_import_draft(id uuid PRIMARY KEY,owner text NOT NULL,payload jsonb NOT NULL,graded_result jsonb,expires_at timestamptz NOT NULL)`);}
 async down(q:QueryRunner){await q.query('DROP TABLE practice_import_draft');await q.query('DELETE FROM ai_job WHERE note_id IS NULL');await q.query('ALTER TABLE ai_job ALTER COLUMN note_id SET NOT NULL');}
}
