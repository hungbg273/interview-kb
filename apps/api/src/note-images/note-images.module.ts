import { Module } from '@nestjs/common';
import { NoteImagesRepository } from '../database/note-images.repository';
import { NoteImagesController } from './note-images.controller';
import { NoteImagesService } from './note-images.service';
@Module({
  controllers: [NoteImagesController],
  providers: [NoteImagesRepository, NoteImagesService],
  exports: [NoteImagesRepository],
})
export class NoteImagesModule {}
