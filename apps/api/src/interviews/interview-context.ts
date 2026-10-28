import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  InterviewContext,
  InterviewDocument,
  InterviewSetup,
} from '@kb/shared';
import { OPENAI_INTERVIEW_VOICES } from '@kb/shared';
import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';

export const MAX_CONTEXT_CHARS = 40000;
export const MAX_DOCUMENT_CHARS = 30000;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normalize the current document array and previously saved single-document setups. */
export function interviewDocuments(setup: InterviewSetup): InterviewDocument[] {
  const legacy = [setup.source, setup.documentText, setup.filename].some(
    (value) => value !== undefined,
  );
  if (setup.documents !== undefined && legacy)
    throw AppError.validation(
      'Use documents or the legacy single-document fields, not both.',
    );
  const documents =
    setup.documents !== undefined
      ? setup.documents
      : legacy
        ? [
            {
              source: setup.source,
              filename: setup.filename,
              text: setup.documentText,
            },
          ]
        : [];
  if (!Array.isArray(documents) || documents.length > 2)
    throw AppError.validation('Choose at most one JD and one CV.');
  const kinds = new Set<string>();
  return documents.map((document) => {
    if (
      !document ||
      !['jd', 'cv'].includes(document.source as string) ||
      kinds.has(document.source as string) ||
      typeof document.filename !== 'string' ||
      !document.filename.trim() ||
      document.filename.trim().length > 255 ||
      typeof document.text !== 'string' ||
      !document.text.trim() ||
      document.text.trim().length > MAX_DOCUMENT_CHARS
    )
      throw AppError.validation(
        'Each document must have a unique JD/CV source, filename, and readable text up to 30,000 characters.',
      );
    kinds.add(document.source as string);
    return {
      source: document.source as 'jd' | 'cv',
      filename: document.filename.trim(),
      // Strip NUL (\u0000): Postgres text/jsonb rejects it (error 22P05). Text
      // resent by the client may still contain it even after extraction.
      text: document.text.trim().replace(/\u0000/g, ''),
    };
  });
}

export function validateSetup(setup: InterviewSetup) {
  if (
    !setup ||
    !['fresher', 'junior', 'middle', 'senior', 'expert'].includes(
      setup.level,
    ) ||
    !['en', 'vi'].includes(setup.lang) ||
    !['openai', 'deepseek'].includes(setup.provider)
  )
    throw AppError.validation(
      'Choose a level, language and interview provider.',
    );
  const documents = interviewDocuments(setup);
  if (
    !Array.isArray(setup.noteIds) ||
    !Array.isArray(setup.topicIds) ||
    setup.noteIds.length > 30 ||
    setup.topicIds.length > 20 ||
    [...setup.noteIds, ...setup.topicIds].some(
      (id) => typeof id !== 'string' || !uuid.test(id),
    )
  )
    throw AppError.validation(
      'Choose up to 20 subjects and 30 notes from your library.',
    );
  if (!documents.length && setup.noteIds.length + setup.topicIds.length === 0)
    throw AppError.validation('Choose at least one JD, CV, subject, or note.');
  if (
    documents.reduce((total, document) => total + document.text.length, 0) >
    MAX_CONTEXT_CHARS
  )
    throw AppError.validation(
      'Combined document context exceeds 40,000 characters. Shorten the documents.',
    );
  if (
    !Number.isInteger(setup.durationMinutes) ||
    setup.durationMinutes < 5 ||
    setup.durationMinutes > 60
  )
    throw AppError.validation('Choose a duration between 5 and 60 minutes.');
  if (
    setup.voice !== undefined &&
    (typeof setup.voice !== 'string' ||
      !setup.voice.trim() ||
      setup.voice.length > 500 ||
      (setup.provider === 'openai' &&
        !(OPENAI_INTERVIEW_VOICES as readonly string[]).includes(setup.voice)))
  )
    throw AppError.validation(
      'Choose a supported voice (maximum 500 characters).',
    );
}

@Injectable()
export class InterviewContextResolver {
  constructor(private readonly db: DataSource) {}
  async resolve(setup: InterviewSetup): Promise<InterviewContext> {
    validateSetup(setup);
    const owner = currentAccount().id;
    const topicIds = [...new Set(setup.topicIds)];
    const noteIds = [...new Set(setup.noteIds)];
    const documentCharacters = interviewDocuments(setup).reduce(
      (total, document) => total + document.text.length,
      0,
    );
    if (!topicIds.length && !noteIds.length)
      return { subjects: [], notes: [], characters: documentCharacters };
    const subjects = await this.db.query<Array<{ id: string; name: string }>>(
      'SELECT id,name FROM topic WHERE user_id=$1 AND id=ANY($2::uuid[]) ORDER BY name,id',
      [owner, topicIds],
    );
    if (subjects.length !== topicIds.length)
      throw AppError.notFound('A selected subject is unavailable.');
    // SQL DISTINCT deduplicates explicit notes and notes linked to multiple subjects.
    // 40001 is a rejection sentinel, never a silently truncated accepted note.
    const notes = await this.db.query<
      Array<{ id: string; title: string; body: string }>
    >(
      `SELECT DISTINCT n.id,n.title,left(n.body_markdown,40001) AS body FROM note n WHERE n.user_id=$1 AND (n.id=ANY($3::uuid[]) OR EXISTS (SELECT 1 FROM note_topic nt WHERE nt.note_id=n.id AND nt.topic_id=ANY($2::uuid[]))) ORDER BY n.id LIMIT 101`,
      [owner, topicIds, noteIds],
    );
    const resolved = new Set(notes.map((n) => n.id));
    if (noteIds.some((id) => !resolved.has(id)))
      throw AppError.notFound('A selected note is unavailable.');
    const characters =
      documentCharacters +
      subjects.reduce((n, s) => n + s.name.length, 0) +
      notes.reduce((n, note) => n + note.title.length + note.body.length, 0);
    if (notes.length > 100 || characters > MAX_CONTEXT_CHARS)
      throw AppError.validation(
        'Selected context is too large. Shorten the document or select fewer subjects/notes (maximum 40,000 characters and 100 notes).',
      );
    return { subjects, notes, characters };
  }
}
