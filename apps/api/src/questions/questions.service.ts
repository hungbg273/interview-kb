import { isValidMcq } from '@kb/shared';
import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { NotesRepository } from '../database/notes.repository';
import { QuestionsRepository } from '../database/questions.repository';
import { Note } from '../entities/note.entity';
import { Question } from '../entities/question.entity';
import { CreateQuestionDto, UpdateQuestionDto } from './dto';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly questions: QuestionsRepository,
    private readonly notes: NotesRepository,
  ) {}

  async create(noteId: string, dto: CreateQuestionDto) {
    const note = await this.notes.findById(noteId);
    if (!note) throw AppError.notFound('Note not found');
    if (!isValidMcq(dto)) throw AppError.validation('Invalid ABCD question');
    const question = new Question();
    question.note = { id: noteId } as Note;
    question.prompt = dto.prompt.trim();
    question.choiceA = dto.choiceA.trim();
    question.choiceB = dto.choiceB.trim();
    question.choiceC = dto.choiceC.trim();
    question.choiceD = dto.choiceD.trim();
    question.correctChoice = dto.correctChoice;
    question.explanationMarkdown = dto.explanationMarkdown ?? null;
    question.source = 'manual';
    return this.questions.save(question);
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const row = await this.questions.findById(id);
    if (!row) throw AppError.notFound('Question not found');
    if (Object.keys(dto).length === 0) {
      throw AppError.validation('At least one field is required');
    }
    Object.assign(row, dto);
    return this.questions.save(row);
  }

  async remove(id: string) {
    const row = await this.questions.findById(id);
    if (!row) throw AppError.notFound('Question not found');
    await this.questions.deleteById(id);
  }
}
