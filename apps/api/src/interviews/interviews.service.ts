import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  InterviewSession,
  InterviewSetup,
  InterviewTurn,
} from '@kb/shared';
import { AppError } from '../common/app-error';
import { DocumentExtractor } from '../practice/document-extractor';
import {
  InterviewContextResolver,
  interviewDocuments,
  MAX_DOCUMENT_CHARS,
} from './interview-context';
import { InterviewGateway } from './interview-gateway';
import { InterviewsRepository } from './interviews.repository';

const MAX_TRANSCRIPT_CHARS = 100000;
const MAX_TURNS = 240;
export type TurnInput = { id: string; text: string; afterTurnId: string };
function validateTurns(turns: InterviewTurn[]) {
  if (
    !Array.isArray(turns) ||
    turns.length > MAX_TURNS ||
    turns.some(
      (t) =>
        !t ||
        typeof t.id !== 'string' ||
        !/^[\w:.-]{1,160}$/.test(t.id) ||
        !['user', 'assistant'].includes(t.role) ||
        typeof t.text !== 'string' ||
        !t.text.trim() ||
        t.text.length > 12000,
    ) ||
    turns.reduce((n, t) => n + t.text.length, 0) > MAX_TRANSCRIPT_CHARS
  )
    throw AppError.validation(
      'Transcript exceeds the limit or contains invalid turns (240 turns / 100,000 characters).',
    );
}
function assertActive(session: InterviewSession) {
  if (session.status !== 'active')
    throw AppError.conflict('This interview has ended.');
  if (Date.now() >= Date.parse(session.expiresAt))
    throw AppError.conflict(
      'Interview time has elapsed. Finish to receive feedback.',
    );
}

@Injectable()
export class InterviewsService {
  constructor(
    private readonly store: InterviewsRepository,
    private readonly context: InterviewContextResolver,
    private readonly gateway: InterviewGateway,
    private readonly extractor: DocumentExtractor,
  ) {}
  providers() {
    return this.gateway.availability();
  }
  voicePreview(input: { voice: string; lang: 'en' | 'vi' }) {
    return this.gateway.voicePreview(input);
  }
  preview(setup: InterviewSetup) {
    return this.context.resolve(setup);
  }
  async prepareDocument(
    file:
      { buffer: Buffer; originalname: string; mimetype: string } | undefined,
  ) {
    if (
      !file ||
      file.buffer.length === 0 ||
      file.buffer.length > 5 * 1024 * 1024 ||
      file.originalname.length > 255
    )
      throw AppError.validation('Upload a PDF or DOCX no larger than 5 MB.');
    let text: string;
    try {
      text = (
        await this.extractor.extract(
          file.buffer,
          file.mimetype,
          file.originalname,
        )
      ).trim();
    } catch {
      throw AppError.validation(
        'Could not read this document. Upload a text-based PDF or DOCX.',
      );
    }
    if (!text || text.length > MAX_DOCUMENT_CHARS)
      throw AppError.validation(
        `The document must contain readable text up to ${MAX_DOCUMENT_CHARS} characters. Shorten long documents; scanned PDFs need OCR first.`,
      );
    return { filename: file.originalname, text };
  }
  async start(setup: InterviewSetup): Promise<InterviewSession> {
    const context = await this.context.resolve(setup);
    this.gateway.assertAvailable(setup.provider);
    const snapshot = structuredClone(setup);
    const documents = interviewDocuments(setup);
    if (snapshot.documents !== undefined) snapshot.documents = documents;
    else if (documents.length) {
      snapshot.filename = documents[0].filename;
      snapshot.documentText = documents[0].text;
    }
    const session: InterviewSession = {
      id: randomUUID(),
      setup: snapshot,
      context,
      status: 'active',
      expiresAt: new Date(
        Date.now() + setup.durationMinutes * 60000,
      ).toISOString(),
      turns: [],
      feedback: null,
    };
    if (setup.provider === 'deepseek')
      session.turns.push({
        id: randomUUID(),
        role: 'assistant',
        text: await this.gateway.question(session),
      });
    return this.store.create(session);
  }
  get(id: string) {
    return this.store.get(id);
  }
  async turn(id: string, input: TurnInput) {
    validateTurns([{ id: input.id, role: 'user', text: input.text }]);
    if (typeof input.afterTurnId !== 'string' || !input.afterTurnId)
      throw AppError.validation('The current question ID is required.');
    return this.store.lock(id, async (session) => {
      if (session.setup.provider !== 'deepseek')
        throw AppError.validation(
          'Use the realtime connection for OpenAI answers.',
        );
      const previous = session.turns.findIndex((t) => t.id === input.id);
      if (previous >= 0) {
        if (
          session.turns[previous].role !== 'user' ||
          session.turns[previous].text !== input.text ||
          session.turns[previous - 1]?.id !== input.afterTurnId
        )
          throw AppError.conflict('This answer ID has already been used.');
        return session;
      }
      assertActive(session);
      const last = session.turns.at(-1);
      if (last?.role !== 'assistant' || last.id !== input.afterTurnId)
        throw AppError.conflict(
          'The interview has moved to another question. Reload before answering.',
        );
      // Leave room for the generated question before paying for the provider request.
      if (
        session.turns.length + 2 > MAX_TURNS ||
        session.turns.reduce((n, t) => n + t.text.length, 0) +
          input.text.length +
          12000 >
          MAX_TRANSCRIPT_CHARS
      )
        throw AppError.conflict(
          'Transcript limit reached. Finish this interview.',
        );
      session.turns.push({ id: input.id, role: 'user', text: input.text });
      const question = await this.gateway.question(session);
      session.turns.push({
        id: randomUUID(),
        role: 'assistant',
        text: question,
      });
      return session;
    });
  }
  async transcript(id: string, turns: InterviewTurn[]) {
    validateTurns(turns);
    return this.store.lock(id, async (session) => {
      if (session.setup.provider !== 'openai')
        throw AppError.validation(
          'Transcript events are only accepted for OpenAI voice sessions.',
        );
      if (session.status !== 'active')
        throw AppError.conflict('This interview has ended.');
      // Permit the final buffered transcript after the deadline, but never new provider work.
      const byId = new Map(session.turns.map((t) => [t.id, t]));
      for (const turn of turns) {
        const old = byId.get(turn.id);
        if (old && (old.text !== turn.text || old.role !== turn.role))
          throw AppError.conflict(
            'A transcript event ID has conflicting content.',
          );
        if (!old) {
          const snapshot = { id: turn.id, role: turn.role, text: turn.text };
          session.turns.push(snapshot);
          byId.set(turn.id, snapshot);
        }
      }
      const incomingIds = new Set(turns.map((t) => t.id));
      if (session.turns.every((t) => incomingIds.has(t.id))) {
        // The browser sends serialized full snapshots so delayed transcription can
        // repair chronological order. Partial stale snapshots never drop stored turns.
        session.turns = [...new Set(turns.map((t) => t.id))].map((turnId) =>
          byId.get(turnId)!,
        );
      }
      validateTurns(session.turns);
      return session;
    });
  }
  realtime(id: string) {
    return this.store.lock(id, async (session, metadata) => {
      assertActive(session);
      if (session.setup.provider !== 'openai')
        throw AppError.validation('Select OpenAI to use realtime audio.');
      if (metadata.credentials >= 3)
        throw AppError.conflict(
          'Voice connection retry limit reached. Finish this interview and start a new one.',
        );
      const credential = await this.gateway.realtime(session);
      metadata.credentials += 1;
      return credential;
    });
  }
  async finish(id: string): Promise<InterviewSession> {
    // Commit the end state before evaluation. Provider failures cannot leave a session active.
    await this.store.lock(id, async (session) => {
      session.status = 'finished';
    });
    return this.store.lock(id, async (session) => {
      if (!session.feedback)
        session.feedback = await this.gateway.evaluate(session);
      return session;
    });
  }
}
