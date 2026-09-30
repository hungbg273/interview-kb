import { Injectable } from '@nestjs/common';
import { NotesService } from '../notes/notes.service';
import { TopicsService } from '../topics/topics.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly topics: TopicsService,
    private readonly notes: NotesService,
  ) {}

  async search(q: string) {
    const query = q.trim();
    const [topicRows, noteRows] = await Promise.all([
      this.topics.searchByName(query),
      this.notes.searchByTitle(query),
    ]);
    return {
      topics: topicRows.map((t) => ({ id: t.id, name: t.name })),
      notes: noteRows.map((n) => ({ id: n.id, title: n.title })),
    };
  }
}
