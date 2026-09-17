import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1760000000001 implements MigrationInterface {
  name = 'InitSchema1760000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "question_correct_choice" AS ENUM ('A', 'B', 'C', 'D')`,
    );
    await queryRunner.query(
      `CREATE TYPE "question_source" AS ENUM ('manual', 'ai')`,
    );
    await queryRunner.query(`
      CREATE TABLE "topic" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL UNIQUE,
        "parent_id" uuid REFERENCES "topic"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "tag" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL UNIQUE,
        "slug" varchar NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "note" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar(200) NOT NULL,
        "body_markdown" text NOT NULL,
        "topic_id" uuid REFERENCES "topic"("id"),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "note_tag" (
        "note_id" uuid NOT NULL REFERENCES "note"("id") ON DELETE CASCADE,
        "tag_id" uuid NOT NULL REFERENCES "tag"("id"),
        PRIMARY KEY ("note_id", "tag_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "question" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "note_id" uuid NOT NULL REFERENCES "note"("id") ON DELETE CASCADE,
        "prompt" text NOT NULL,
        "choice_a" varchar(2000) NOT NULL,
        "choice_b" varchar(2000) NOT NULL,
        "choice_c" varchar(2000) NOT NULL,
        "choice_d" varchar(2000) NOT NULL,
        "correct_choice" "question_correct_choice" NOT NULL,
        "explanation_markdown" text,
        "source" "question_source" NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "question"`);
    await queryRunner.query(`DROP TABLE "note_tag"`);
    await queryRunner.query(`DROP TABLE "note"`);
    await queryRunner.query(`DROP TABLE "tag"`);
    await queryRunner.query(`DROP TABLE "topic"`);
    await queryRunner.query(`DROP TYPE "question_source"`);
    await queryRunner.query(`DROP TYPE "question_correct_choice"`);
  }
}
