import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { MeetingCaption, MeetingContext, MeetingSetup } from '@kb/shared';
import { AppError } from '../common/app-error';
import { MeetingAi } from './meeting-ai';
import { MeetingSessions, type MeetingState } from './meeting-sessions';

@Injectable()
export class MeetingsService {
  constructor(
    private readonly sessions: MeetingSessions,
    private readonly ai: MeetingAi,
  ) {}
  start(setup: MeetingSetup) {
    // Resolve identity before exposing provider availability.
    const view = this.sessions.create(setup);
    try {
      this.ai.assertAvailable(setup.provider, setup.inputMode ?? 'audio');
      return view;
    } catch (error) {
      this.sessions.stop(view.id);
      throw error;
    }
  }
  get(id: string) {
    return structuredClone(this.sessions.get(id).view);
  }
  context(id: string, context: MeetingContext) {
    const state = this.sessions.get(id);
    if (state.pending) throw AppError.conflict('Meeting is busy.');
    state.view.context = structuredClone(context);
    return structuredClone(state.view);
  }
  stop(id: string) {
    return this.sessions.stop(id);
  }
  async caption(id: string, dto: MeetingCaption, clientSignal?: AbortSignal) {
    const state = this.sessions.get(id);
    if (state.view.inputMode !== 'captions')
      throw AppError.validation('Start a captions session first.');
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          sequence: dto.sequence,
          utteranceId: dto.utteranceId,
          text: dto.text,
          speaker: dto.speaker ?? '',
        }),
      )
      .digest('hex');
    if (state.lastCaption?.hash === hash)
      return structuredClone(state.lastCaption.result);
    if (dto.sequence !== state.view.nextSequence)
      throw AppError.conflict('Unexpected caption sequence.');
    return this.operate(
      state,
      async (signal) => {
        const translation = await this.ai.translate(
          state.view,
          dto.text,
          signal,
        );
        signal.throwIfAborted();
        const result = { ...dto, translation };
        state.view.segments = state.view.segments.filter(
          (s) => s.utteranceId !== dto.utteranceId,
        );
        state.view.segments.push(result);
        while (
          state.view.segments.length > 50 ||
          state.view.segments.reduce(
            (n, s) => n + s.text.length + s.translation.length,
            0,
          ) > 20000
        )
          state.view.segments.shift();
        state.view.nextSequence++;
        state.lastCaption = { hash, result };
        return structuredClone(result);
      },
      clientSignal,
    );
  }
  async audio(
    id: string,
    sequence: number,
    audio: Buffer,
    clientSignal?: AbortSignal,
  ) {
    const state = this.sessions.get(id);
    if (state.view.inputMode === 'captions')
      throw AppError.validation('This session accepts captions, not audio.');
    const hash = createHash('sha256').update(audio).digest('hex');
    if (state.lastAudio?.sequence === sequence && state.lastAudio.hash === hash)
      return structuredClone(
        state.view.segments[state.view.segments.length - 1],
      );
    if (sequence !== state.view.nextSequence)
      throw AppError.conflict('Unexpected audio sequence.');
    return this.operate(
      state,
      async (signal) => {
        const source = await this.ai.transcribe(
          audio,
          state.view.sourceLang,
          signal,
        );
        signal.throwIfAborted();
        const translation = await this.ai.translate(state.view, source, signal);
        signal.throwIfAborted();
        const result = { sequence, text: source, translation };
        state.view.segments.push(result);
        while (
          state.view.segments.length > 50 ||
          state.view.segments.reduce(
            (n, s) => n + s.text.length + s.translation.length,
            0,
          ) > 20000
        )
          state.view.segments.shift();
        state.view.nextSequence++;
        state.lastAudio = { hash, sequence };
        return structuredClone(result);
      },
      clientSignal,
    );
  }
  async suggest(
    id: string,
    dto: { draft?: string },
    clientSignal?: AbortSignal,
  ) {
    const state = this.sessions.get(id);
    const draft = dto.draft?.trim() || '';
    if (!draft && !state.view.segments.some((s) => s.text))
      throw AppError.validation('Supply speech or a draft first.');
    if (Date.now() - state.lastSuggestionAt < 2000)
      throw AppError.conflict('Wait 2 seconds between suggestions.');
    return this.operate(
      state,
      (signal) => {
        state.lastSuggestionAt = Date.now();
        return this.ai.suggest(state.view, draft, signal);
      },
      clientSignal,
    );
  }
  private async operate<T>(
    state: MeetingState,
    work: (signal: AbortSignal) => Promise<T>,
    client?: AbortSignal,
  ): Promise<T> {
    if (state.pending) throw AppError.conflict('Meeting is busy.');
    if (state.attempts >= 1600)
      throw AppError.conflict('Meeting operation limit reached.');
    const controller = new AbortController();
    state.pending = controller;
    state.attempts++;
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(
        30000,
        Math.max(0, Date.parse(state.view.expiresAt) - Date.now()),
      ),
    );
    const abort = () => controller.abort();
    client?.addEventListener('abort', abort, { once: true });
    if (client?.aborted) abort();
    try {
      controller.signal.throwIfAborted();
      const result = await work(controller.signal);
      controller.signal.throwIfAborted();
      return result;
    } catch (error) {
      if (controller.signal.aborted)
        throw AppError.conflict('Meeting operation cancelled or expired.');
      throw error;
    } finally {
      clearTimeout(timer);
      client?.removeEventListener('abort', abort);
      if (state.pending === controller) state.pending = undefined;
    }
  }
}
