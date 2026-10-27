import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { ChatgptConnection } from './chatgpt.connection';
class ConnectDto {
  @IsString() @MaxLength(2048) returnPath!: string;
}
class ModelDto {
  @IsString() @MaxLength(200) model!: string;
}
type AuthRequest = Request & { user: { email: string } };
@Controller('chatgpt')
export class ChatgptController {
  constructor(private readonly connection: ChatgptConnection) {}
  @Get('status') status(@Req() req: AuthRequest) {
    return this.connection.status(req.user.email);
  }
  @Get('models') models(@Req() req: AuthRequest) {
    return this.connection.models(req.user.email);
  }
  @Post('model') select(@Req() req: AuthRequest, @Body() body: ModelDto) {
    return this.connection.selectModel(req.user.email, body.model);
  }
  @Post('connect') connect(@Req() req: AuthRequest, @Body() body: ConnectDto) {
    return this.connection.begin(req.user.email, body.returnPath);
  }
  @Post('disconnect') disconnect(@Req() req: AuthRequest) {
    return this.connection.disconnect(req.user.email);
  }
  @Public()
  @Get('authorize')
  async authorize(@Query('ticket') ticket: string, @Res() res: Response) {
    const auth = await this.connection.authorize(
      typeof ticket === 'string' ? ticket : '',
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.cookie(auth.cookie, auth.binding, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/chatgpt/callback',
      maxAge: 600000,
    });
    res.redirect(auth.url);
  }
  @Public()
  @Get('callback')
  async callback(
    @Query() raw: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const query = Object.fromEntries(
      ['state', 'code', 'client_id', 'error'].map((key) => [
        key,
        typeof raw[key] === 'string' ? raw[key] : undefined,
      ]),
    );
    const cookie = query.state ? this.connection.cookieName(query.state) : '';
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const redirect = await this.connection.finish(query, req.cookies?.[cookie]);
    if (cookie) res.clearCookie(cookie, { path: '/chatgpt/callback' });
    res.redirect(redirect);
  }
}
