import { ERROR_CODES } from '@kb/shared';
import { PracticeService } from './practice.service';

const q1 = {
  id: 'q1',
  prompt: 'What is SYN?',
  choiceA: 'a',
  choiceB: 'b',
  choiceC: 'c',
  choiceD: 'd',
  correctChoice: 'A',
  explanationMarkdown: 'handshake',
  source: 'manual',
  lang: 'en',
};

const q2 = {
  id: 'q2',
  prompt: 'ACK?',
  choiceA: 'a',
  choiceB: 'b',
  choiceC: 'c',
  choiceD: 'd',
  correctChoice: 'B',
  explanationMarkdown: null,
  source: 'ai',
  lang: 'en',
};

describe('PracticeService', () => {
  it('lists questions without answers and caps to limit', async () => {
    const questions = {
      listByNote: jest.fn().mockResolvedValue([q1, q2]),
    };
    const notes = { findById: jest.fn().mockResolvedValue({ id: 'n1' }) };
    const svc = new PracticeService(
      questions as never,
      notes as never,
      { findById: jest.fn() } as never,
    );

    const result = await svc.listQuestions({ noteId: 'n1', limit: 1, lang: 'en' });

    expect(questions.listByNote).toHaveBeenCalledWith('n1', 'en');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: expect.any(String),
      prompt: expect.any(String),
      choiceA: 'a',
      choiceB: 'b',
      choiceC: 'c',
      choiceD: 'd',
    });
    expect(result.items[0]).not.toHaveProperty('correctChoice');
    expect(result.items[0]).not.toHaveProperty('explanationMarkdown');
    expect(result.items[0]).not.toHaveProperty('source');
  });

  it('filters the pool by practice language', async () => {
    const questions = {
      listByNote: jest.fn().mockResolvedValue([]),
    };
    const svc = new PracticeService(
      questions as never,
      { findById: jest.fn().mockResolvedValue({ id: 'n1' }) } as never,
      { findById: jest.fn() } as never,
    );

    const result = await svc.listQuestions({ noteId: 'n1', lang: 'vi' });

    expect(questions.listByNote).toHaveBeenCalledWith('n1', 'vi');
    expect(result.items).toEqual([]);
  });

  it('rejects when neither noteId nor topicId is provided', async () => {
    const svc = new PracticeService(
      { listByNote: jest.fn() } as never,
      { findById: jest.fn() } as never,
      { findById: jest.fn() } as never,
    );
    await expect(svc.listQuestions({ lang: 'en' })).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
    });
  });

  it('merges unique questions from multiple notes and topics', async () => {
    const shared = { ...q1, id: 'shared' };
    const questions = {
      listByNote: jest
        .fn()
        .mockImplementation(async (id: string) => (id === 'n1' ? [shared, q1] : [q2])),
      listByTopicId: jest.fn().mockResolvedValue([shared]),
    };
    const notes = { findById: jest.fn().mockResolvedValue({ id: 'ok' }) };
    const topics = { findById: jest.fn().mockResolvedValue({ id: 'ok' }) };
    const svc = new PracticeService(questions as never, notes as never, topics as never);

    const result = await svc.listQuestions({
      noteId: ['n1', 'n2'],
      topicId: ['t1'],
      lang: 'en',
      limit: 50,
    });

    expect(questions.listByNote).toHaveBeenCalledWith('n1', 'en');
    expect(questions.listByNote).toHaveBeenCalledWith('n2', 'en');
    expect(questions.listByTopicId).toHaveBeenCalledWith('t1', 'en');
    expect(result.items.map((item) => item.id).sort()).toEqual(['q1', 'q2', 'shared']);
  });

  it('404 when the note is missing', async () => {
    const svc = new PracticeService(
      { listByNote: jest.fn() } as never,
      { findById: jest.fn().mockResolvedValue(null) } as never,
      { findById: jest.fn() } as never,
    );
    await expect(
      svc.listQuestions({ noteId: 'missing', lang: 'en' }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.NOT_FOUND,
    });
  });

  it('grades answers in request order', async () => {
    const questions = {
      listByIds: jest.fn().mockResolvedValue([q1, q2]),
    };
    const svc = new PracticeService(
      questions as never,
      { findById: jest.fn() } as never,
      { findById: jest.fn() } as never,
    );

    const result = await svc.grade({
      answers: [
        { questionId: 'q2', choice: 'B' },
        { questionId: 'q1', choice: 'C' },
      ],
    });

    expect(result.total).toBe(2);
    expect(result.correct).toBe(1);
    expect(result.items[0]).toMatchObject({
      questionId: 'q2',
      choice: 'B',
      correctChoice: 'B',
      ok: true,
    });
    expect(result.items[1]).toMatchObject({
      questionId: 'q1',
      choice: 'C',
      correctChoice: 'A',
      ok: false,
      explanationMarkdown: 'handshake',
    });
  });

  it('rejects duplicate or unknown question ids', async () => {
    const svc = new PracticeService(
      { listByIds: jest.fn().mockResolvedValue([q1]) } as never,
      { findById: jest.fn() } as never,
      { findById: jest.fn() } as never,
    );
    await expect(
      svc.grade({
        answers: [
          { questionId: 'q1', choice: 'A' },
          { questionId: 'q1', choice: 'B' },
        ],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION });
    await expect(
      svc.grade({ answers: [{ questionId: 'missing', choice: 'A' }] }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION });
  });
});
