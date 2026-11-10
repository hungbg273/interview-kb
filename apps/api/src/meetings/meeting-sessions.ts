import { randomUUID } from 'node:crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { MeetingSession, MeetingSetup } from '@kb/shared';
import { currentAccount } from '../accounts/account-context';
import { AppError } from '../common/app-error';

export type MeetingState = {
  owner: string;
  view: MeetingSession;
  attempts: number;
  lastSuggestionAt: number;
  lastAudio?: { hash: string; sequence: number };
  lastCaption?: { hash: string; result: import('@kb/shared').MeetingSegment };
  pending?: AbortController;
  expiry: ReturnType<typeof setTimeout>;
};
/** Deliberately ephemeral and single-instance. Never persist context or transcripts. */
@Injectable()
export class MeetingSessions implements OnModuleDestroy {
  private readonly sessions = new Map<string, MeetingState>();
  create(setup: MeetingSetup): MeetingSession {
    const owner = currentAccount().id;
    this.prune();
    if ([...this.sessions.values()].some((s) => s.owner === owner))
      throw AppError.conflict(
        'Stop the active meeting before starting another.',
      );
    if (this.sessions.size >= 100)
      throw AppError.conflict('Meeting capacity reached.');
    const id = randomUUID();
    const ttl = 2 * 60 * 60 * 1000;
    const expiry = setTimeout(() => this.remove(id), ttl);
    expiry.unref();
    const view: MeetingSession = {
      ...structuredClone(setup),
      id,
      status: 'active',
      expiresAt: new Date(Date.now() + ttl).toISOString(),
      nextSequence: 0,
      segments: [],
    };
    this.sessions.set(id, {
      owner,
      view,
      attempts: 0,
      lastSuggestionAt: -Infinity,
      expiry,
    });
    return structuredClone(view);
  }
  get(id: string): MeetingState {
    const owner = currentAccount().id;
    this.prune();
    const state = this.sessions.get(id);
    if (!state || state.owner !== owner)
      throw AppError.notFound('Meeting not found.');
    return state;
  }
  stop(id: string) {
    const owner = currentAccount().id;
    if (this.sessions.get(id)?.owner === owner) this.remove(id);
    return { status: 'stopped' as const };
  }
  private remove(id: string) {
    const state = this.sessions.get(id);
    if (!state) return;
    state.pending?.abort();
    clearTimeout(state.expiry);
    state.view.context = {};
    state.view.segments = [];
    this.sessions.delete(id);
  }
  private prune() {
    for (const [id, state] of this.sessions)
      if (Date.parse(state.view.expiresAt) <= Date.now()) this.remove(id);
  }
  onModuleDestroy() {
    for (const id of this.sessions.keys()) this.remove(id);
  }
}
