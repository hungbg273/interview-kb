import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AUTH_COOKIE } from './auth.constants';
import type { JwtPayload } from './jwt.strategy';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Start Google OAuth (browser redirect)' })
  googleStart() {
    return;
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Allowlisted email sets httpOnly cookie `kb_access_token` and redirects to the web app. Others go to `/login?error=forbidden`.',
  })
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const email = (req.user as { email?: string } | undefined)?.email;
    const result = await this.auth.completeGoogleLogin(email);

    if (!result.ok) {
      res.clearCookie(AUTH_COOKIE, { path: '/' });
      return res.redirect(result.redirect);
    }

    res.cookie(AUTH_COOKIE, result.token, this.auth.cookieOptions());
    return res.redirect(result.redirect);
  }

  @Get('me')
  @ApiCookieAuth('kb_access_token')
  @ApiOperation({ summary: 'Current allowlisted user' })
  @ApiOkResponse({ schema: { example: { email: 'you@example.com' } } })
  me(@Req() req: Request & { user: JwtPayload }) {
    return this.auth.currentUser(req.user.email);
  }

  @Post('logout')
  @ApiCookieAuth('kb_access_token')
  @ApiOperation({ summary: 'Clear JWT cookie' })
  @ApiNoContentResponse()
  logout(@Res() res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    return res.status(204).send();
  }
}
