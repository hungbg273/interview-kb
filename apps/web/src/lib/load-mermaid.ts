import type mermaid from "mermaid";
let pending: Promise<typeof mermaid> | undefined;
/** Load the self-hosted, prebuilt ESM bundle without sending Mermaid through Webpack. */
export function loadMermaid(): Promise<typeof mermaid> {
  if (!pending) {
    const url = "/vendor/mermaid/mermaid.esm.min.mjs";
    pending = import(/* webpackIgnore: true */ url)
      .then((module) => module.default)
      .catch((error) => {
        pending = undefined;
        throw error;
      });
  }
  return pending;
}
