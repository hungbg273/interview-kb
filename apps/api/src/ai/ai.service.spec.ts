import { ERROR_CODES } from '@kb/shared';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';

function validMcq(prompt: string) {
  return {
    prompt,
    choiceA: 'a',
    choiceB: 'b',
    choiceC: 'c',
    choiceD: 'd',
    correctChoice: 'A' as const,
  };
}

describe('AiService', () => {
  const note = {
    id: 'n1',
    title: 'TCP',
    bodyMarkdown: 'TCP is reliable',
  };
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('summarize does not update the note', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = {
      findById: jest.fn().mockResolvedValue(note),
      save: jest.fn(),
    };
    const questions = { save: jest.fn() };
    const llm = { complete: jest.fn().mockResolvedValue('short summary') };
    const svc = new AiService(notes as never, questions as never, llm as never);

    const result = await svc.run('n1', { action: 'summarize', provider: 'openai' });

    expect(result).toEqual({ markdown: 'short summary' });
    expect(notes.save).not.toHaveBeenCalled();
    expect(questions.save).not.toHaveBeenCalled();
  });

  it('expand returns markdown and does not update the note', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = {
      findById: jest.fn().mockResolvedValue(note),
      save: jest.fn(),
    };
    const questions = { save: jest.fn() };
    const llm = { complete: jest.fn().mockResolvedValue('longer note') };
    const svc = new AiService(notes as never, questions as never, llm as never);

    const result = await svc.run('n1', { action: 'expand', provider: 'openai' });

    expect(result).toEqual({ markdown: 'longer note' });
    expect(notes.save).not.toHaveBeenCalled();
    expect(questions.save).not.toHaveBeenCalled();
  });

  it('drops invalid generated MCQs', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = { findById: jest.fn().mockResolvedValue(note) };
    const questions = {
      save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
      listRecentAiByNote: jest.fn().mockResolvedValue([]),
    };
    const llm = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify([
          validMcq('Q1'),
          { prompt: 'bad', correctChoice: 'Z' },
        ]),
      ),
    };
    const svc = new AiService(notes as never, questions as never, llm as never);
    await svc.run('n1', { action: 'generate-questions', provider: 'openai', targetLang: 'en' });
    expect(questions.save).toHaveBeenCalledTimes(1);
    expect(questions.save).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Q1', source: 'ai', correctChoice: 'A', lang: 'en' }),
    );
  });

  it('caps generated questions at 8', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = { findById: jest.fn().mockResolvedValue(note) };
    const questions = {
      save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
      listRecentAiByNote: jest.fn().mockResolvedValue([]),
    };
    const llm = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify(Array.from({ length: 9 }, (_, i) => validMcq(`Q${i + 1}`))),
      ),
    };
    const svc = new AiService(notes as never, questions as never, llm as never);
    await svc.run('n1', { action: 'generate-questions', provider: 'openai', count: 8, targetLang: 'en' });
    expect(questions.save).toHaveBeenCalledTimes(8);
  });

  it('generate-questions uses the requested count', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = { findById: jest.fn().mockResolvedValue(note) };
    const questions = {
      save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
      listRecentAiByNote: jest.fn().mockResolvedValue([]),
    };
    const llm = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify(Array.from({ length: 6 }, (_, i) => validMcq(`Q${i + 1}`))),
      ),
    };
    const svc = new AiService(notes as never, questions as never, llm as never);
    await svc.run('n1', {
      action: 'generate-questions',
      provider: 'openai',
      count: 3,
      targetLang: 'en',
    });
    expect(questions.save).toHaveBeenCalledTimes(3);
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Exactly 3'),
      }),
    );
  });

  it('generate-questions uses the requested difficulty', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = { findById: jest.fn().mockResolvedValue(note) };
    const questions = {
      save: jest.fn().mockImplementation((row) => Promise.resolve(row)),
      listRecentAiByNote: jest.fn().mockResolvedValue([]),
    };
    const llm = {
      complete: jest.fn().mockResolvedValue(JSON.stringify([validMcq('Q1')])),
    };
    const svc = new AiService(notes as never, questions as never, llm as never);
    await svc.run('n1', {
      action: 'generate-questions',
      provider: 'openai',
      count: 1,
      difficulty: 'hard',
      targetLang: 'vi',
    });
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('hard'),
      }),
    );
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('Vietnamese'),
      }),
    );
    expect(questions.save).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'vi' }),
    );
  });

  it('generate-content returns markdown without saving the note', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = {
      findById: jest.fn().mockResolvedValue(note),
      save: jest.fn(),
    };
    const llm = { complete: jest.fn().mockResolvedValue('# Draft') };
    const svc = new AiService(notes as never, { save: jest.fn() } as never, llm as never);
    const result = await svc.run('n1', { action: 'generate-content', provider: 'openai' });
    expect(result).toEqual({ markdown: '# Draft' });
    expect(notes.save).not.toHaveBeenCalled();
  });

  it('translate-note returns translated markdown', async () => {
    process.env.OPENAI_API_KEY = 'sk';
    const notes = {
      findById: jest.fn().mockResolvedValue(note),
      save: jest.fn(),
    };
    const llm = { complete: jest.fn().mockResolvedValue('TCP is reliable') };
    const svc = new AiService(notes as never, { save: jest.fn() } as never, llm as never);
    const result = await svc.run('n1', {
      action: 'translate-note',
      provider: 'openai',
      targetLang: 'en',
    });
    expect(result).toEqual({ markdown: 'TCP is reliable' });
    expect(llm.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining('English'),
      }),
    );
  });

  it('throws NOT_FOUND when the note is missing', async () => {
    const notes = { findById: jest.fn().mockResolvedValue(null) };
    const llm = { complete: jest.fn() };
    const svc = new AiService(notes as never, { save: jest.fn() } as never, llm as never);
    await expect(
      svc.run('missing', { action: 'summarize', provider: 'openai' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.NOT_FOUND });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it('throws AI_NOT_CONFIGURED when key missing', async () => {
    process.env.OPENAI_API_KEY = '';
    const notes = { findById: jest.fn().mockResolvedValue(note) };
    const svc = new AiService(
      notes as never,
      { save: jest.fn() } as never,
      new LlmClient(),
    );
    await expect(
      svc.run('n1', { action: 'summarize', provider: 'openai' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.AI_NOT_CONFIGURED });
  });
});
