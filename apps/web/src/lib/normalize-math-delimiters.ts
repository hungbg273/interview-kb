/** Convert common LaTeX delimiters to remark-math delimiters outside code. */
export function normalizeMathDelimiters(markdown: string): string {
  const code = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`]*?`+)/g;
  return markdown
    .split(code)
    .map((part) => {
      if (/^(?:```|~~~|`)/.test(part)) return part;
      return part
        .replace(
          /\\\[([\s\S]*?)\\\]/g,
          (_, formula: string) => `$$\n${formula.trim()}\n$$`,
        )
        .replace(/\\\((.+?)\\\)/g, (_, formula: string) => `$${formula}$`);
    })
    .join("");
}
