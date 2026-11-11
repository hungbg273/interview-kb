import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendNoteChatDto } from './dto';
describe('note chat request validation', () => {
  const valid = {
    message: 'Explain TCP',
    provider: 'chatgpt',
    requestId: '11111111-1111-4111-8111-111111111111',
    revision: 0,
  };
  it('accepts supported requests', async () => {
    expect(
      await validate(plainToInstance(SendNoteChatDto, valid)),
    ).toHaveLength(0);
  });
  it.each([
    { message: '' },
    { message: 'a'.repeat(2001) },
    { provider: 'unknown' },
    { requestId: 'x' },
    { revision: -1 },
    { revision: 1.5 },
  ])('rejects malformed values %p', async (patch) => {
    expect(
      (await validate(plainToInstance(SendNoteChatDto, { ...valid, ...patch })))
        .length,
    ).toBeGreaterThan(0);
  });
});
