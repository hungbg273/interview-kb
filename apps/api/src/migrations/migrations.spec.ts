import { InitSchema1760000000001 } from './1760000000001-InitSchema';
import { NoteFts1760000000002 } from './1760000000002-NoteFts';

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
});
