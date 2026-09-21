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
    await svc.run('n1', { action: 'generate-questions', provider: 'openai' });
    expect(questions.save).toHaveBeenCalledTimes(1);
    expect(questions.save).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Q1', source: 'ai', correctChoice: 'A' }),
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
    await svc.run('n1', { action: 'generate-questions', provider: 'openai' });
    expect(questions.save).toHaveBeenCalledTimes(8);
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
