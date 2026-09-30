import { Module } from '@nestjs/common';
import { NotesModule } from '../notes/notes.module';
import { TopicsModule } from '../topics/topics.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [TopicsModule, NotesModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
