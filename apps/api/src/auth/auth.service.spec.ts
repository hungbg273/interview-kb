import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const originalEnv = { ...process.env };
  const signAsync = jest.fn().mockResolvedValue('token');
  const jwt = { signAsync } as unknown as JwtService;
  const svc = new AuthService(jwt);

  afterEach(() => {
    process.env = { ...originalEnv };
    signAsync.mockClear();
    signAsync.mockResolvedValue('token');
  });

  it('returns the current user email', () => {
    expect(svc.currentUser('you@example.com')).toEqual({
      email: 'you@example.com',
    });
  });

  it('rejects unknown emails without issuing a JWT', async () => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.ADMIN_EMAILS = 'you@example.com';

    await expect(svc.completeGoogleLogin('nope@x.com')).resolves.toEqual({
      ok: false,
      redirect: 'http://localhost:3000/login?error=forbidden',
    });
    expect(signAsync).not.toHaveBeenCalled();
  });

  it('issues a JWT and home redirect for allowlisted email', async () => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.ADMIN_EMAILS = 'you@example.com';

    await expect(
      svc.completeGoogleLogin('you@example.com'),
    ).resolves.toEqual({
      ok: true,
      token: 'token',
      redirect: 'http://localhost:3000/',
    });
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'you@example.com', email: 'you@example.com' },
      { expiresIn: '7d' },
    );
  });
});
