import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdir, copyFile, readdir, rm } from "node:fs/promises";
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("mermaid"));
const target = new URL("../public/vendor/mermaid/", import.meta.url);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await copyFile(
  join(dist, "mermaid.esm.min.mjs"),
  new URL("mermaid.esm.min.mjs", target),
);
const chunks = "chunks/mermaid.esm.min/";
await mkdir(new URL(chunks, target), { recursive: true });
for (const file of await readdir(join(dist, chunks))) {
  if (file.endsWith(".mjs"))
    await copyFile(join(dist, chunks, file), new URL(chunks + file, target));
}
// Preserve the dependency's license with the self-hosted distribution.
await copyFile(join(dist, "../LICENSE"), new URL("LICENSE", target));
