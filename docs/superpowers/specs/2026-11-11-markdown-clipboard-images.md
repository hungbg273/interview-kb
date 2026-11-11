# Markdown clipboard images

Approved in chat: paste PNG/JPEG/WebP images (5 MiB each) in Markdown edit mode,
including unsaved notes. Store sanitized image bytes in PostgreSQL, not base64 in
Markdown. Insert a canonical /note-images/UUID URL at the selection, retaining draft
edits while uploads finish. Failed uploads restore replaced text. Saving is disabled
while uploads are pending; plain-text paste remains native.

Read access requires authentication and either ownership or a currently published
snapshot referencing an image owned by that publisher. Community clones copy image
bytes into the recipient's ownership transactionally and rewrite their references,
so unpublishing/deleting the source never breaks the recipient's copy. Ordinary
image URLs remain supported. Uploaded images have no public bearer links.

Normalize images with Sharp, strip metadata, constrain decoding to 25 million pixels
and dimensions to 2400px without enlargement; preserve aspect ratio. Render at max
100% of Markdown width, height auto, including community previews. No raw SVG uploads.

Images are durable account assets; removing Markdown does not delete their bytes.
Automatic orphan cleanup is outside this version, avoiding deletion of unsaved drafts.
