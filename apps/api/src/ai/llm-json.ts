export const NOTE_CONTEXT_CHARS = 4000;
export const DOC_CONTEXT_CHARS = 8000;
export const LONG_DOC_CHARS = 4000;
export const STEM_LIMIT = 15;
export const TOPIC_CATALOG_LIMIT = 40;

export function clipText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}\n[đã cắt]`;
}

export function parseLlmJsonArray(raw: string): unknown[] {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (Array.isArray(parsed)) return parsed;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return (parsed as { items: unknown[] }).items;
    }
    return [];
  } catch {
    return [];
  }
}
