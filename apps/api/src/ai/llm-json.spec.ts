import { NOTE_CONTEXT_CHARS, clipText, parseLlmJsonArray } from './llm-json';

describe('clipText', () => {
  it('keeps short text unchanged', () => {
    expect(clipText('hello', 100)).toBe('hello');
  });

  it('cuts long text and marks the cut', () => {
    const raw = 'a'.repeat(NOTE_CONTEXT_CHARS + 50);
    const clipped = clipText(raw, NOTE_CONTEXT_CHARS);
    expect(clipped.endsWith('[đã cắt]')).toBe(true);
    expect(clipped.length).toBeLessThan(raw.length);
    expect(clipped).not.toContain('a'.repeat(NOTE_CONTEXT_CHARS + 1));
  });
});

describe('parseLlmJsonArray', () => {
  it('reads a top-level array', () => {
    expect(parseLlmJsonArray('[{"id":1}]')).toEqual([{ id: 1 }]);
  });

  it('reads { items: [...] } from JSON mode', () => {
    expect(parseLlmJsonArray(JSON.stringify({ items: [{ id: 2 }] }))).toEqual([{ id: 2 }]);
  });

  it('strips markdown fences', () => {
    expect(parseLlmJsonArray('```json\n[{"id":3}]\n```')).toEqual([{ id: 3 }]);
  });
});
