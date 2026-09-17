import { MigrationInterface, QueryRunner } from 'typeorm';

export class NoteBodyLength1760000000003 implements MigrationInterface {
  name = 'NoteBodyLength1760000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "note"
        ADD CONSTRAINT "note_body_markdown_length"
        CHECK (char_length(body_markdown) <= 100000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "note" DROP CONSTRAINT "note_body_markdown_length"`,
    );
  }
}
