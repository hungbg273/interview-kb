import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubjectGraph1760000000004 implements MigrationInterface {
  name = 'SubjectGraph1760000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "topic_parent" (
        "parent_id" uuid NOT NULL REFERENCES "topic"("id") ON DELETE CASCADE,
        "child_id" uuid NOT NULL REFERENCES "topic"("id") ON DELETE CASCADE,
        PRIMARY KEY ("parent_id", "child_id"),
        CHECK ("parent_id" <> "child_id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "topic_parent" ("parent_id", "child_id")
      SELECT "parent_id", "id" FROM "topic" WHERE "parent_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE "note_topic" (
        "note_id" uuid NOT NULL REFERENCES "note"("id") ON DELETE CASCADE,
        "topic_id" uuid NOT NULL REFERENCES "topic"("id") ON DELETE CASCADE,
        PRIMARY KEY ("note_id", "topic_id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "note_topic" ("note_id", "topic_id")
      SELECT "id", "topic_id" FROM "note" WHERE "topic_id" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "topic" DROP COLUMN "parent_id"`);
    await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "topic_id"`);
    await queryRunner.query(`DROP TABLE "note_tag"`);
    await queryRunner.query(`DROP TABLE "tag"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tag" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL UNIQUE,
        "slug" varchar NOT NULL UNIQUE,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "note_tag" (
        "note_id" uuid NOT NULL REFERENCES "note"("id") ON DELETE CASCADE,
        "tag_id" uuid NOT NULL REFERENCES "tag"("id"),
        PRIMARY KEY ("note_id", "tag_id")
      )
    `);
    await queryRunner.query(`ALTER TABLE "topic" ADD COLUMN "parent_id" uuid REFERENCES "topic"("id")`);
    await queryRunner.query(`ALTER TABLE "note" ADD COLUMN "topic_id" uuid REFERENCES "topic"("id")`);
    await queryRunner.query(`
      UPDATE "topic" t SET "parent_id" = tp."parent_id"
      FROM "topic_parent" tp WHERE tp."child_id" = t."id"
    `);
    await queryRunner.query(`
      UPDATE "note" n SET "topic_id" = nt."topic_id"
      FROM "note_topic" nt WHERE nt."note_id" = n."id"
    `);
    await queryRunner.query(`DROP TABLE "note_topic"`);
    await queryRunner.query(`DROP TABLE "topic_parent"`);
  }
}
