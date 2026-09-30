import { InitSchema1760000000001 } from './1760000000001-InitSchema';
import { NoteFts1760000000002 } from './1760000000002-NoteFts';
import { NoteBodyLength1760000000003 } from './1760000000003-NoteBodyLength';
import { SubjectGraph1760000000004 } from './1760000000004-SubjectGraph';
import { QuestionLang1760000000005 } from './1760000000005-QuestionLang';

function collectSql(fn: (runner: { query: (sql: string) => Promise<void> }) => Promise<void>) {
  const statements: string[] = [];
  return fn({
    query: async (sql: string) => {
      statements.push(sql);
    },
  }).then(() => statements.join('\n'));
}

describe('schema migrations', () => {
  it('creates knowledge-base tables without a user table', async () => {
    const sql = await collectSql((runner) =>
      new InitSchema1760000000001().up(runner as never),
    );
    expect(sql).toMatch(/CREATE TABLE "topic"/);
    expect(sql).toMatch(/CREATE TABLE "tag"/);
    expect(sql).toMatch(/CREATE TABLE "note"/);
    expect(sql).toMatch(/CREATE TABLE "note_tag"/);
    expect(sql).toMatch(/CREATE TABLE "question"/);
    expect(sql).toMatch(/ON DELETE CASCADE/);
    expect(sql).not.toMatch(/CREATE TABLE "user"/);
  });

  it('adds generated note search_vector and a GIN index', async () => {
    const sql = await collectSql((runner) =>
      new NoteFts1760000000002().up(runner as never),
    );
    expect(sql).toMatch(/search_vector/);
    expect(sql).toMatch(/GENERATED ALWAYS/);
    expect(sql).toMatch(/to_tsvector\('english'/);
    expect(sql).toMatch(/body_markdown/);
    expect(sql).toMatch(/USING GIN/);
  });

  it('limits note body_markdown to 100000 characters', async () => {
    const sql = await collectSql((runner) =>
      new NoteBodyLength1760000000003().up(runner as never),
    );
    expect(sql).toMatch(/note_body_markdown_length/);
    expect(sql).toMatch(/char_length\(body_markdown\) <= 100000/);
  });

  it('moves parent and note links onto join tables and drops tags', async () => {
    const sql = await collectSql((runner) =>
      new SubjectGraph1760000000004().up(runner as never),
    );
    expect(sql).toMatch(/CREATE TABLE "topic_parent"/);
    expect(sql).toMatch(/CREATE TABLE "note_topic"/);
    expect(sql).toMatch(/DROP TABLE "tag"/);
    expect(sql).toMatch(/DROP COLUMN "parent_id"/);
    expect(sql).toMatch(/DROP COLUMN "topic_id"/);
  });

  it('adds question lang enum', async () => {
    const sql = await collectSql((runner) =>
      new QuestionLang1760000000005().up(runner as never),
    );
    expect(sql).toMatch(/CREATE TYPE "question_lang"/);
    expect(sql).toMatch(/ADD COLUMN "lang"/);
  });
});
