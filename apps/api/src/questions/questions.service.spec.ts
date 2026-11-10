import { AppError } from '../common/app-error';
import { QuestionsService } from './questions.service';

describe('QuestionsService.create', () => {
  it('rejects invalid correctChoice', async () => {
    const svc = new QuestionsService(
      { save: jest.fn() } as never,
      { findById: jest.fn().mockResolvedValue({ id: 'n1' }) } as never,
    );
    await expect(
      svc.create('n1', {
        prompt: 'Q?',
        choiceA: 'a',
        choiceB: 'b',
        choiceC: 'c',
        choiceD: 'd',
        correctChoice: 'E' as never,
        lang: 'en',
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('404 when note is missing', async () => {
    const questions = { save: jest.fn() };
    const svc = new QuestionsService(
      questions as never,
      {
        findById: jest.fn().mockResolvedValue(null),
      } as never,
    );
    await expect(
      svc.create('missing', {
        prompt: 'Q?',
        choiceA: 'a',
        choiceB: 'b',
        choiceC: 'c',
        choiceD: 'd',
        correctChoice: 'A',
        lang: 'en',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(questions.save).not.toHaveBeenCalled();
  });
});

describe('QuestionsService.update', () => {
  it('rejects an empty patch', async () => {
    const svc = new QuestionsService(
      { findById: jest.fn().mockResolvedValue({ id: 'q1' }) } as never,
      {} as never,
    );
    await expect(svc.update('q1', {})).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });
});

describe('essay creation', () => {
  it('persists reference and rubric without MCQ fields', async () => {
    const save = jest.fn(async (value) => value);
    const svc = new QuestionsService(
      { save } as never,
      { findById: async () => ({ id: 'n' }) } as never,
    );
    await svc.create('n', {
      type: 'essay',
      prompt: 'Explain transactions',
      referenceAnswer: 'Atomic changes',
      rubric: [{ id: 'a', description: 'Accuracy', maxPoints: 10 }],
      lang: 'vi',
    } as never);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'essay',
        referenceAnswer: 'Atomic changes',
        choiceA: null,
        correctChoice: null,
      }),
    );
  });
});
