import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { SearchQuery } from './dto';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiCookieAuth('kb_access_token')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@Query() query: SearchQuery) {
    return this.search.search(query.q);
  }
}
