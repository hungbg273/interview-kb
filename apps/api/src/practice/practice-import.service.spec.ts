import { ERROR_CODES } from '@kb/shared';
import { PracticeImportService } from './practice-import.service';

function mcq(i: number) {
  return {
    id: `q${i}`,
    prompt: `Prompt ${i}?`,
    choiceA: 'a',
    choiceB: 'b',
    choiceC: 'c',
    choiceD: 'd',
    correctChoice: 'A' as const,
    explanationMarkdown: `why ${i}`,
    suggestedTopics: ['TCP'],
  };
}

function eightMcqs() {
  return Array.from({ length: 8 }, (_, i) => mcq(i + 1));
}

function buildService(overrides?: {
  llm?: { complete: jest.Mock };
  notes?: { findById: jest.Mock };
  topics?: { create: jest.Mock; searchByName: jest.Mock };
  questions?: { save: jest.Mock };
  noteTopics?: { add: jest.Mock; replaceForNote: jest.Mock };
}) {
  const extractor = { extract: jest.fn().mockResolvedValue('Built TCP services at a bank') };
  const llm = overrides?.llm ?? {
    complete: jest.fn().mockResolvedValue(JSON.stringify(eightMcqs())),
  };
  const notes = overrides?.notes ?? {
    findById: jest.fn().mockResolvedValue({ id: 'n1', title: 'TCP' }),
  };
  const topics = overrides?.topics ?? {
    create: jest.fn().mockResolvedValue({ id: 't1', name: 'TCP' }),
    searchByName: jest.fn().mockResolvedValue([]),
    listNames: jest.fn().mockResolvedValue(['TCP', 'HTTP']),
  };
  const questions = overrides?.questions ?? {
    save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
  };
  const noteTopics = overrides?.noteTopics ?? {
    add: jest.fn().mockResolvedValue(undefined),
    replaceForNote: jest.fn(),
  };
  return {
    extractor,
    llm,
    notes,
    topics,
    questions,
    noteTopics,
    svc: new PracticeImportService(
      extractor as never,
      llm as never,
      notes as never,
      topics as never,
      questions as never,
      noteTopics as never,
    ),
  };
}

describe('PracticeImportService', () => {
  it('returns eight public questions and never exposes answers', async () => {
    const { svc, llm } = buildService();

    const result = await svc.start({
      source: 'cv',
      lang: 'en',
      level: 'junior',
      filename: 'cv.pdf',
      mime: 'application/pdf',
      buffer: Buffer.from('%PDF'),
    });

    expect(result.items).toHaveLength(8);
    expect(result.draftId).toEqual(expect.any(String));
    expect(result.items[0]).toEqual({
      id: expect.any(String),
      prompt: expect.any(String),
      choiceA: 'a',
      choiceB: 'b',
      choiceC: 'c',
      choiceD: 'd',
      suggestedTopics: ['TCP'],
    });
    expect(result.items[0]).not.toHaveProperty('correctChoice');
    expect(result.items[0]).not.toHaveProperty('explanationMarkdown');
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        json: true,
        system: expect.stringMatching(/English[\s\S]*junior|junior[\s\S]*English/),
        user: expect.stringContaining('TCP'),
      }),
    );
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('extracts facts first when the document is long', async () => {
    const llm = {
      complete: jest
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ facts: { role: 'Backend', skills: ['TCP'] } }))
        .mockResolvedValueOnce(JSON.stringify({ items: eightMcqs() })),
    };
    const { svc, extractor } = buildService({ llm });
    extractor.extract.mockResolvedValue('y'.repeat(5000));

    const result = await svc.start({
      source: 'jd',
      lang: 'en',
      level: 'senior',
      filename: 'jd.pdf',
      mime: 'application/pdf',
      buffer: Buffer.from('%PDF'),
    });

    expect(result.items).toHaveLength(8);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(llm.complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ json: true, system: expect.stringContaining('facts') }),
    );
  });

  it('after grade, saves only kept questions onto the chosen note', async () => {
    const questions = {
      save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
    };
    const noteTopics = {
      add: jest.fn().mockResolvedValue(undefined),
      replaceForNote: jest.fn(),
    };
    const topics = {
      create: jest.fn().mockResolvedValue({ id: 't1', name: 'TCP' }),
      searchByName: jest.fn().mockResolvedValue([]),
      listNames: jest.fn().mockResolvedValue(['TCP']),
    };
    const { svc } = buildService({ questions, noteTopics, topics });
    const started = await svc.start({
      source: 'jd',
      lang: 'vi',
      level: 'senior',
      filename: 'jd.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('pk'),
    });
    expect(started.items).toHaveLength(8);
    const keepId = started.items[0].id;

    await svc.keep(started.draftId, {
      keeps: [{ questionId: keepId, noteId: 'n1', topicNames: ['TCP'] }],
    });

    const graded = await svc.grade(started.draftId, {
      answers: [{ questionId: keepId, choice: 'A' }],
    });

    expect(graded.total).toBe(1);
    expect(questions.save).toHaveBeenCalledTimes(1);
    expect(questions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: started.items[0].prompt,
        lang: 'vi',
        source: 'ai',
      }),
    );
    expect(topics.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'TCP' }));
    expect(noteTopics.add).toHaveBeenCalledWith('n1', 't1');
    expect(noteTopics.replaceForNote).not.toHaveBeenCalled();
  });

  it('404 when the draft is missing', async () => {
    const { svc } = buildService();
    await expect(svc.keep('missing', { keeps: [] })).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });
});
