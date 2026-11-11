import { NoteChatService } from './note-chat.service';
import { withAccount } from '../accounts/account-context';

const account = {
  id: 'owner',
  email: 'owner@example.test',
  displayName: 'Owner',
};
describe('note chat', () => {
  let service: NoteChatService;
  const notes = { findById: jest.fn() };
  const chats = {
    get: jest.fn(),
    claim: jest.fn(),
    finish: jest.fn(),
    release: jest.fn(),
    reset: jest.fn(),
  };
  const llm = { complete: jest.fn() };
  const dto = {
    message: 'Explain this',
    provider: 'chatgpt' as const,
    requestId: 'request',
    revision: 0,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    notes.findById.mockResolvedValue({
      title: 'TCP',
      bodyMarkdown: 'Three-way handshake',
    });
    chats.get.mockResolvedValue(null);
    chats.claim.mockResolvedValue(true);
    chats.finish.mockResolvedValue(true);
    llm.complete.mockResolvedValue('Explanation');
    service = new NoteChatService(notes as never, chats as never, llm as never);
  });
  const run = (work: () => unknown) => withAccount(account, work);
  it('sends owned note and server history to the provider and stores a successful turn', async () => {
    chats.get.mockResolvedValue({
      revision: 0,
      turns: [{ id: 'old', question: 'What is TCP?', answer: 'A protocol' }],
    });
    await run(() => service.send('note', dto));
    const prompt = llm.complete.mock.calls[0][0];
    expect(prompt.owner).toBe(account.email);
    expect(prompt.user).toContain('Three-way handshake');
    expect(prompt.user).toContain('What is TCP?');
    expect(chats.finish).toHaveBeenCalledWith(
      'note',
      expect.any(String),
      expect.objectContaining({
        question: 'Explain this',
        answer: 'Explanation',
      }),
    );
  });
  it('rejects a foreign note before reading history or calling AI', async () => {
    notes.findById.mockResolvedValue(null);
    await expect(run(() => service.send('foreign', dto))).rejects.toMatchObject(
      { status: 404 },
    );
    expect(chats.get).not.toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();
  });
  it('releases the lease on failure without saving a partial exchange', async () => {
    llm.complete.mockRejectedValue(new Error('offline'));
    await expect(run(() => service.send('note', dto))).rejects.toThrow(
      'offline',
    );
    expect(chats.release).toHaveBeenCalledWith('note', expect.any(String));
    expect(chats.finish).not.toHaveBeenCalled();
  });
  it('rejects concurrent/stale requests before inference', async () => {
    chats.claim.mockResolvedValue(false);
    await expect(run(() => service.send('note', dto))).rejects.toMatchObject({
      status: 409,
    });
    expect(llm.complete).not.toHaveBeenCalled();
  });
  it('does not generate a second reply for a completed request', async () => {
    chats.get.mockResolvedValue({
      revision: 1,
      turns: [
        {
          id: 'request',
          question: 'Explain this',
          provider: 'chatgpt',
          answer: 'Done',
        },
      ],
    });
    await run(() => service.send('note', dto));
    expect(llm.complete).not.toHaveBeenCalled();
  });
  it('rejects oversized note context rather than silently omitting content', async () => {
    notes.findById.mockResolvedValue({
      title: 'Long',
      bodyMarkdown: 'x'.repeat(40001),
    });
    await expect(run(() => service.send('note', dto))).rejects.toMatchObject({
      status: 400,
    });
    expect(llm.complete).not.toHaveBeenCalled();
  });
});
