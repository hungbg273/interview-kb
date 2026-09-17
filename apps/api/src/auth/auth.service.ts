import { isAdminEmail } from '@kb/shared';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions } from 'express';
import type { JwtPayload } from './jwt.strategy';

export type GoogleLoginResult =
  | { ok: false; redirect: string }
  | { ok: true; token: string; redirect: string };

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  currentUser(email: string) {
    return { email };
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  async completeGoogleLogin(email: string | undefined): Promise<GoogleLoginResult> {
    const web = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const allow = process.env.ADMIN_EMAILS ?? '';

    if (!email || !isAdminEmail(email, allow)) {
      return { ok: false, redirect: `${web}/login?error=forbidden` };
    }

    const token = await this.jwt.signAsync(
      { sub: email, email } satisfies JwtPayload,
      { expiresIn: '7d' },
    );
    return { ok: true, token, redirect: `${web}/` };
  }
}
