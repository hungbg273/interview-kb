import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuestionLang1760000000005 implements MigrationInterface {
  name = 'QuestionLang1760000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "question_lang" AS ENUM ('en', 'vi')`);
    await queryRunner.query(
      `ALTER TABLE "question" ADD COLUMN "lang" "question_lang" NOT NULL DEFAULT 'en'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "question" DROP COLUMN "lang"`);
    await queryRunner.query(`DROP TYPE "question_lang"`);
  }
}
