import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function controller(jwt?: Partial<JwtService>) {
    const mod = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('token'), ...jwt },
        },
      ],
    }).compile();
    return mod.get(AuthController);
  }

  it('returns email from request.user', async () => {
    const ctrl = await controller();
    expect(ctrl.me({ user: { email: 'you@example.com' } } as never)).toEqual({
      email: 'you@example.com',
    });
  });

  it('redirects to login?error=forbidden when email is not allowlisted', async () => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.ADMIN_EMAILS = 'you@example.com';
    const ctrl = await controller();
    const res = { clearCookie: jest.fn(), redirect: jest.fn() };

    await ctrl.googleCallback(
      { user: { email: 'nope@x.com' } } as never,
      res as never,
    );

    expect(res.clearCookie).toHaveBeenCalledWith('kb_access_token', {
      path: '/',
    });
    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=forbidden',
    );
  });

  it('sets httpOnly JWT cookie and redirects home for allowlisted email', async () => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.ADMIN_EMAILS = 'you@example.com';
    const signAsync = jest.fn().mockResolvedValue('token');
    const ctrl = await controller({ signAsync } as never);
    const res = { cookie: jest.fn(), redirect: jest.fn() };

    await ctrl.googleCallback(
      { user: { email: 'you@example.com' } } as never,
      res as never,
    );

    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'you@example.com', email: 'you@example.com' },
      { expiresIn: '7d' },
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'kb_access_token',
      'token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }),
    );
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/');
  });

  it('clears the JWT cookie on logout', async () => {
    const ctrl = await controller();
    const res = {
      clearCookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    ctrl.logout(res as never);

    expect(res.clearCookie).toHaveBeenCalledWith('kb_access_token', {
      path: '/',
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
