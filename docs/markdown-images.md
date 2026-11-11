# Images in Markdown

In a note's **Chỉnh sửa** mode, paste a clipboard image with Ctrl+V or Cmd+V.
PNG, JPEG and WebP are supported, up to 5 MiB per image. The editor inserts an
image reference at the current selection. Ordinary text paste stays unchanged.

You can keep typing while images upload. Saving is unavailable until uploads
finish. Failed uploads restore the selected text, retaining text typed elsewhere;
paste again to retry. Removing the upload placeholder deliberately cancels its
insertion. Leaving the editor aborts its upload request.

Preview images preserve their aspect ratio and never exceed the Markdown column.
Tall images are limited to 70% of the viewport height (maximum 720px). Small images
are not stretched. Replace `Ảnh dán` in `![Ảnh dán](...)` with a useful description.

## Storage and access

The API stores normalized image bytes in PostgreSQL `note_image`. This supersedes
the initial v1 exclusion of hosted images. Run `npm run migration:run -w api` when
deploying this change. Sharp is a production API dependency; reinstall dependencies
or rebuild the API container during deployment.

- `POST /note-images`: authenticated multipart `file`; returns portable relative URL.
- `GET /note-images/:id`: authenticated binary response, private/no-store cache policy.
- Only the owner can read an unpublished image. Authenticated community readers can
  read images referenced in a published snapshot owned by that image's owner.
- Community clones copy the bytes transactionally to the recipient and rewrite URLs.
  Unpublishing or deleting the original note does not break a recipient's saved copy.
- SVG/animated/invalid images are rejected. Images are decoded and re-encoded,
  metadata stripped, and dimensions reduced to 2400px without enlargement.
- Uploads are durable account assets. Removing their Markdown or abandoning a draft
  does not delete the bytes; automatic orphan cleanup is not part of this version.

Back up PostgreSQL to include both Markdown and its image bytes. URLs are portable
across web/API host changes because the preview resolves them through the configured
API origin. Exporting Markdown alone does not include the image bytes.

## Checks

`npm test` includes image service, authenticated HTTP and editor tests.
`RUN_NOTE_IMAGES_INTEGRATION=1 npm run test -w api -- --runInBand src/note-images/note-images.integration.spec.ts`
uses the configured PostgreSQL connection to create and remove an isolated test
database, checking privacy, publication revocation and clone independence.
