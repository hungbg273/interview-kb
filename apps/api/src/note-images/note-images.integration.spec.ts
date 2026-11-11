import '../load-env';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { createDataSource, typeormOptions } from '../database/typeorm.config';
import { AccountsService } from '../accounts/accounts.service';
import { withAccount, type Account } from '../accounts/account-context';
import { NoteImagesRepository } from '../database/note-images.repository';
import { NoteImagesService } from './note-images.service';
import { CommunityService } from '../community/community.service';
import { Note } from '../entities/note.entity';
const suite =
  process.env.RUN_NOTE_IMAGES_INTEGRATION === '1' ? describe : describe.skip;
suite(
  'note image ownership and community copies in isolated PostgreSQL',
  () => {
    let admin: DataSource,
      db: DataSource,
      repo: NoteImagesRepository,
      images: NoteImagesService,
      community: CommunityService;
    let alice: Account, bob: Account;
    const database = 'image_test_' + randomUUID().replace(/-/g, '');
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
      alice = await accounts.ensure('image-alice@example.invalid');
      bob = await accounts.ensure('image-bob@example.invalid');
      repo = new NoteImagesRepository(db);
      images = new NoteImagesService(repo);
      community = new CommunityService(db, repo);
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
    it('keeps drafts private, authorizes publications, and preserves a cloned image after source deletion', async () => {
      const buffer = await sharp({
        create: { width: 8, height: 4, channels: 3, background: '#009988' },
      })
        .png()
        .toBuffer();
      const image = await withAccount(alice, () =>
        images.upload({ buffer, mimetype: 'image/png' }),
      );
      await expect(
        withAccount(bob, () => images.get(image.id)),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (await withAccount(alice, () => images.get(image.id))).data.length,
      ).toBeGreaterThan(0);
      // Merely placing another account's private URL in a publication grants nothing.
      const malicious = await db
        .getRepository(Note)
        .save({
          userId: bob.id,
          title: 'Foreign image',
          bodyMarkdown: `![x](${image.url})`,
        });
      await withAccount(bob, () => community.publish(malicious.id));
      await expect(
        withAccount(bob, () => images.get(image.id)),
      ).rejects.toMatchObject({ status: 404 });
      const source = await db
        .getRepository(Note)
        .save({
          userId: alice.id,
          title: 'Image note',
          bodyMarkdown: `![Diagram](${image.url})`,
        });
      const publication = await withAccount(alice, () =>
        community.publish(source.id),
      );
      expect(
        (await withAccount(bob, () => images.get(image.id))).mimeType,
      ).toBe('image/png');
      const clone = await withAccount(bob, () =>
        community.clone(publication.id),
      );
      const saved = await db
        .getRepository(Note)
        .findOneByOrFail({ id: clone.id });
      const copiedId = saved.bodyMarkdown.match(
        /\/note-images\/([0-9a-f-]+)/,
      )![1];
      expect(copiedId).not.toBe(image.id);
      await withAccount(alice, () => community.unpublish(source.id));
      await expect(
        withAccount(bob, () => images.get(image.id)),
      ).rejects.toMatchObject({ status: 404 });
      await db.getRepository(Note).delete(source.id);
      expect(
        (
          await sharp(
            (await withAccount(bob, () => images.get(copiedId))).data,
          ).metadata()
        ).width,
      ).toBe(8);
    });
  },
);
