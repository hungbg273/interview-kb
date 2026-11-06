import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import {
  IsString,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { ChatgptConnection } from './chatgpt.connection';
import { AppError } from '../common/app-error';
class ConnectDto {
  @IsString() @MaxLength(2048) returnPath!: string;
  @IsOptional() @IsInt() @Min(1024) @Max(65535) loopbackPort?: number;
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
    return this.connection.begin(
      req.user.email,
      body.returnPath,
      body.loopbackPort,
    );
  }
  @Post('disconnect') disconnect(@Req() req: AuthRequest) {
    return this.connection.disconnect(req.user.email);
  }
  @Public()
  @Get('authorize')
  async authorize(
    @Query('ticket') ticket: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.requireLoopback(req);
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
    this.requireLoopback(req);
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
  private requireLoopback(req: Request) {
    if (req.hostname !== '127.0.0.1')
      throw AppError.validation(
        'Mở kết nối qua HTTP 127.0.0.1 và forwarding tới đúng API khi dùng máy chủ từ xa.',
      );
  }
}
