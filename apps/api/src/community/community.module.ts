import { NoteImagesModule } from '../note-images/note-images.module';
import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
@Module({
  imports: [NoteImagesModule],
  controllers: [CommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
