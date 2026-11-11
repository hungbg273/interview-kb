import '../load-env';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { createDataSource, typeormOptions } from '../database/typeorm.config';
import { AccountsService } from '../accounts/accounts.service';
import { withAccount, type Account } from '../accounts/account-context';
import { NoteChatRepository } from '../database/note-chat.repository';
import { NotesRepository } from '../database/notes.repository';
import { NoteChatService } from './note-chat.service';
import { Note } from '../entities/note.entity';
const suite =
  process.env.RUN_NOTE_CHAT_INTEGRATION === '1' ? describe : describe.skip;
suite('note chat persistence and isolation', () => {
  let admin: DataSource,
    db: DataSource,
    repo: NoteChatRepository,
    service: NoteChatService;
  let alice: Account, bob: Account;
  const database = 'chat_test_' + randomUUID().replace(/-/g, '');
  const llm = { complete: jest.fn().mockResolvedValue('An explanation') };
  beforeAll(async () => {
    admin = createDataSource();
    await admin.initialize();
    await admin.query('CREATE DATABASE ' + database);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = '/' + database;
    db = new DataSource({ ...typeormOptions(), url: url.href } as never);
    await db.initialize();
    await db.runMigrations();
    const accounts = new AccountsService(db);
    alice = await accounts.ensure('chat-alice@example.invalid');
    bob = await accounts.ensure('chat-bob@example.invalid');
    repo = new NoteChatRepository(db);
    service = new NoteChatService(new NotesRepository(db), repo, llm as never);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin?.isInitialized) {
      await admin.query(
        'DROP DATABASE IF EXISTS ' + database + ' WITH (FORCE)',
      );
      await admin.destroy();
    }
  });
  it('persists/replays turns, rejects foreign access, serializes concurrent turns, and cascades note deletion', async () => {
    const note = await db
      .getRepository(Note)
      .save({
        userId: alice.id,
        title: 'TCP',
        bodyMarkdown: 'Three-way handshake',
      });
    const dto = {
      message: 'Explain',
      provider: 'chatgpt' as const,
      requestId: randomUUID(),
      revision: 0,
    };
    const result = await withAccount(alice, () => service.send(note.id, dto));
    expect(result.turns).toHaveLength(1);
    expect(result.revision).toBe(1);
    expect(result.pending).toBe(false);
    expect(await withAccount(alice, () => service.send(note.id, dto))).toEqual(
      result,
    );
    expect(llm.complete).toHaveBeenCalledTimes(1);
    await expect(
      withAccount(bob, () => service.history(note.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      withAccount(bob, () => service.send(note.id, dto)),
    ).rejects.toMatchObject({ status: 404 });
    expect(await withAccount(bob, () => repo.get(note.id))).toBeNull();
    const a = randomUUID(),
      b = randomUUID();
    const claimed = await withAccount(alice, () =>
      Promise.all([repo.claim(note.id, a, 1), repo.claim(note.id, b, 1)]),
    );
    expect(claimed.filter(Boolean)).toHaveLength(1);
    const winner = claimed[0] ? a : b;
    expect(await withAccount(alice, () => repo.reset(note.id, 1))).toBe(false);
    await db.query(
      "UPDATE note_chat SET pending_at=now()-interval '4 minutes' WHERE note_id=$1",
      [note.id],
    );
    const replacement = randomUUID();
    expect(
      await withAccount(alice, () => repo.claim(note.id, replacement, 1)),
    ).toBe(true);
    expect(
      await withAccount(alice, () =>
        repo.finish(note.id, winner, result.turns[0]),
      ),
    ).toBe(false);
    await withAccount(alice, () => repo.release(note.id, winner));
    expect(
      (await withAccount(alice, () => service.history(note.id))).pending,
    ).toBe(true);
    await withAccount(alice, () => repo.release(note.id, replacement));
    const cleared = await withAccount(alice, () => service.clear(note.id, 1));
    expect(cleared).toEqual({ turns: [], revision: 2, pending: false });
    expect(
      await withAccount(alice, () => repo.claim(note.id, randomUUID(), 1)),
    ).toBe(false);
    await db.getRepository(Note).delete(note.id);
    expect(
      await db.query('SELECT * FROM note_chat WHERE note_id=$1', [note.id]),
    ).toEqual([]);
  });
});
