import { MigrationInterface, QueryRunner } from 'typeorm';

export class NoteFts1760000000002 implements MigrationInterface {
  name = 'NoteFts1760000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "note"
        ADD COLUMN "search_vector" tsvector
        GENERATED ALWAYS AS (
          to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body_markdown, ''))
        ) STORED
    `);
    await queryRunner.query(
      `CREATE INDEX "note_search_vector_idx" ON "note" USING GIN ("search_vector")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "note_search_vector_idx"`);
    await queryRunner.query(
      `ALTER TABLE "note" DROP COLUMN "search_vector"`,
    );
  }
}
