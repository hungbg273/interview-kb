# Markdown clipboard images implementation plan

Goal: paste real images into all Markdown editors, with durable private storage and
responsive rendering. Stack: NestJS/TypeORM/PostgreSQL, Sharp, React Markdown.

- [x] Add migration/entity and account-scoped image repository. Read images only for
  the owner or authenticated readers of the owner's published snapshot.
- [x] Add 5 MiB multipart upload and guarded binary GET endpoints. Decode/re-encode
  with Sharp before persistence; reject malformed/unsupported images.
- [x] Copy image assets and rewrite relative references inside the existing community
  clone transaction; rollback both the note and assets on failure.
- [x] Add clipboard upload handling to MarkdownField with unique temporary markers,
  latest-value replacement, abort on unmount and draft-preserving error messages.
- [x] Disable save while uploads are pending in both NoteEditor and TopicNoteContent.
- [x] Render private image URLs via authenticated fetch and revocable object URLs;
  constrain image width/height in every Markdown preview.
- [x] Verify upload validation, account isolation, publication revocation, clone
  independence, paste/caret behavior, pending saves and responsive image layout.
- [x] Run migration locally, frontend/backend tests and TypeScript/build checks.
