import { isAdminEmail } from '@kb/shared';

describe('isAdminEmail', () => {
  it('matches a listed email case-insensitively', () => {
    expect(isAdminEmail('You@Example.com', 'you@example.com, other@x.com')).toBe(
      true,
    );
  });

  it('rejects unknown emails', () => {
    expect(isAdminEmail('nope@x.com', 'you@example.com')).toBe(false);
  });
});
