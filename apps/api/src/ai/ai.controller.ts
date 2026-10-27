import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { RunAiDto } from './dto';

@ApiTags('ai')
@ApiCookieAuth('kb_access_token')
@Controller('notes')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post(':id/ai')
  run(
    @Param('id') id: string,
    @Body() dto: RunAiDto,
    @Req() req: { user: { email: string } },
  ) {
    return this.ai.run(id, dto, req.user.email);
  }
}
