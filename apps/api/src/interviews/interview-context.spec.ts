import {
  InterviewContextResolver,
  interviewDocuments,
  validateSetup,
} from './interview-context';
import { withAccount } from '../accounts/account-context';
import { setup } from './interview-fixtures';

const owner = { id: 'owner', email: 'test@example.com', displayName: 'Test' };
describe('interview context', () => {
  it('requires at least one source plus valid level, language and provider', () => {
    expect(() => validateSetup({ ...setup, documentText: '  ' })).toThrow();
    expect(() =>
      validateSetup({
        ...setup,
        source: undefined,
        documentText: undefined,
        filename: undefined,
        noteIds: [],
        topicIds: [],
      }),
    ).toThrow();
    expect(() =>
      validateSetup({ ...setup, noteIds: [], topicIds: [] }),
    ).not.toThrow();
    expect(() =>
      validateSetup({ ...setup, provider: 'chatgpt' } as never),
    ).toThrow();
    expect(() => validateSetup({ ...setup, durationMinutes: 0 })).toThrow();
    expect(() => validateSetup(setup)).not.toThrow();
  });
  it('accepts a document alone, library alone, and both documents with library', async () => {
    const base = {
      ...setup,
      source: undefined,
      filename: undefined,
      documentText: undefined,
    };
    const documents = [
      { source: 'jd' as const, filename: 'jd.pdf', text: 'Node.js role' },
      {
        source: 'cv' as const,
        filename: 'cv.pdf',
        text: 'I built background jobs',
      },
    ];
    const query = jest.fn().mockResolvedValue([]);
    const resolver = new InterviewContextResolver({ query } as never);
    const docsOnly = await withAccount(owner, () =>
      resolver.resolve({ ...base, documents, topicIds: [], noteIds: [] }),
    );
    expect(docsOnly.characters).toBe(
      documents.reduce((n, d) => n + d.text.length, 0),
    );
    expect(docsOnly.notes).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    expect(() => validateSetup(base)).not.toThrow();
    expect(() => validateSetup({ ...base, documents })).not.toThrow();
  });
  it('rejects malformed, duplicate, ambiguous or empty documents before any library query', async () => {
    const base = {
      ...setup,
      source: undefined,
      filename: undefined,
      documentText: undefined,
    };
    const doc = {
      source: 'jd' as const,
      filename: 'jd.pdf',
      text: 'Role requirements',
    };
    const bad = [
      { ...base, documents: [doc, doc] },
      { ...base, documents: [{ ...doc, text: '  ' }] },
      { ...base, documents: [{ ...doc, text: 'x'.repeat(30001) }] },
      { ...setup, documents: [doc] },
      { ...base, documents: [{ ...doc, filename: 'x'.repeat(256) }] },
      { ...base, documents: null as never },
      { ...base, documents: [], topicIds: [], noteIds: [] },
    ];
    const query = jest.fn();
    const resolver = new InterviewContextResolver({ query } as never);
    for (const input of bad)
      await expect(
        withAccount(owner, () => resolver.resolve(input)),
      ).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });
  it('counts all source texts toward the combined context limit without clipping', async () => {
    const base = {
      ...setup,
      source: undefined,
      filename: undefined,
      documentText: undefined,
      topicIds: [],
      noteIds: [],
    };
    const query = jest.fn();
    const resolver = new InterviewContextResolver({ query } as never);
    await expect(
      withAccount(owner, () =>
        resolver.resolve({
          ...base,
          documents: [
            { source: 'jd', filename: 'jd.pdf', text: 'x'.repeat(25000) },
            { source: 'cv', filename: 'cv.pdf', text: 'y'.repeat(25000) },
          ],
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });
  it('resolves notes-only context with owner checks and no invented document', async () => {
    const noteId = '22222222-2222-4222-8222-222222222222';
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: noteId, title: 'Queues', body: 'Retry failed jobs.' },
      ]);
    const result = await withAccount(owner, () =>
      new InterviewContextResolver({ query } as never).resolve({
        ...setup,
        source: undefined,
        documentText: undefined,
        filename: undefined,
        documents: [],
        topicIds: [],
        noteIds: [noteId],
      }),
    );
    expect(result.characters).toBe(
      'Queues'.length + 'Retry failed jobs.'.length,
    );
    expect(result.notes[0].id).toBe(noteId);
    expect(query.mock.calls[1][1]).toEqual([owner.id, [], [noteId]]);
  });
  it('counts JD, CV, subjects and deduplicated note text together', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: setup.topicIds[0], name: 'Node.js' }])
      .mockResolvedValueOnce([{ id: 'n1', title: 'Queues', body: 'Retries' }]);
    const documents = [
      { source: 'jd' as const, filename: 'jd.pdf', text: 'Role' },
      { source: 'cv' as const, filename: 'cv.pdf', text: 'Project' },
    ];
    const result = await withAccount(owner, () =>
      new InterviewContextResolver({ query } as never).resolve({
        ...setup,
        source: undefined,
        documentText: undefined,
        filename: undefined,
        documents,
      }),
    );
    expect(result.characters).toBe('RoleProjectNode.jsQueuesRetries'.length);
  });
  it('validates optional voice by provider and preserves legacy setups', () => {
    expect(() =>
      validateSetup({ ...setup, provider: 'openai', voice: 'cedar' }),
    ).not.toThrow();
    expect(() =>
      validateSetup({ ...setup, provider: 'openai', voice: 'unknown' }),
    ).toThrow();
    expect(() =>
      validateSetup({ ...setup, voice: 'local-voice-uri' }),
    ).not.toThrow();
    expect(() => validateSetup({ ...setup, voice: 'x'.repeat(501) })).toThrow();
    expect(() => validateSetup({ ...setup, voice: null as never })).toThrow();
    expect(() => validateSetup(setup)).not.toThrow();
  });
  it('resolves only owned selections and deduplicates notes from subjects', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: setup.topicIds[0], name: 'Node.js' }])
      .mockResolvedValueOnce([
        { id: 'n1', title: 'Event loop', body: 'Tasks and microtasks.' },
      ]);
    const resolver = new InterviewContextResolver({ query } as never);
    const result = await withAccount(owner, () => resolver.resolve(setup));
    expect(result.subjects[0].name).toBe('Node.js');
    expect(result.notes).toHaveLength(1);
    expect(result.characters).toBeGreaterThan(setup.documentText!.length);
    expect(query.mock.calls.every(([, params]) => params[0] === owner.id)).toBe(
      true,
    );
    expect(query.mock.calls[1][0]).toMatch(/DISTINCT/);
  });
  it('rejects missing or foreign subjects before reading their notes', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await expect(
      withAccount(owner, () =>
        new InterviewContextResolver({ query } as never).resolve(setup),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign notes and excess context instead of clipping', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: setup.topicIds[0], name: 'Node.js' }])
      .mockResolvedValueOnce([]);
    await expect(
      withAccount(owner, () =>
        new InterviewContextResolver({ query } as never).resolve({
          ...setup,
          noteIds: ['22222222-2222-4222-8222-222222222222'],
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    query
      .mockResolvedValueOnce([{ id: setup.topicIds[0], name: 'Node.js' }])
      .mockResolvedValueOnce([
        { id: 'n1', title: 'Long', body: 'x'.repeat(40001) },
      ]);
    await expect(
      withAccount(owner, () =>
        new InterviewContextResolver({ query } as never).resolve(setup),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('strips NUL (\\u0000) from document text so Postgres jsonb never fails (22P05)', () => {
    const [document] = interviewDocuments({
      ...setup,
      source: undefined,
      filename: undefined,
      documentText: undefined,
      documents: [
        {
          source: 'cv' as const,
          filename: 'cv.pdf',
          text: 'Argo Work\u0000ows and Certi\u0000ed Developer',
        },
      ],
    });
    expect(document.text).toBe('Argo Workows and Certied Developer');
    expect(document.text).not.toContain('\u0000');
  });
});
