# Mock Interview Providers Implementation Plan

> Execute the approved design task by task, with separate backend and browser-transport work and a final independent code review.

**Goal:** Run contextual voice interviews from a JD/CV, level, selected library material, language, and provider.

**Architecture:** NestJS owns authenticated sessions, source snapshots, provider requests, and evaluation. Next.js owns setup, live transcript, audio transport, and feedback. OpenAI uses short-lived Realtime credentials; DeepSeek uses browser speech and server-side text turns.

**Tech Stack:** Next.js, React, NestJS, TypeORM/PostgreSQL, WebRTC, Web Speech, Jest, Vitest.

## Files and interfaces

- `packages/shared/src/interview.ts`: shared setup, context, transcript, feedback, session, and provider availability contracts; export through shared index.
- `apps/api/src/interviews/`: DTOs, repository, context resolver, prompts, provider gateway, session service, controller, module, and tests.
- `apps/api/src/migrations/1760000000009-Interviews.ts`: durable owner-scoped session JSON snapshots and status.
- `apps/web/src/lib/interview-voice.ts`: cancellable OpenAI WebRTC and browser speech adapters, with transport tests.
- `apps/web/src/app/interview/`: setup and live screen, CSS module, and component tests.
- Existing app module, migration registry, navigation, environment example and deployment docs: feature integration.

## Tasks

- [x] Define shared contracts and write backend tests for required setup, owned library context, deduplication, limits, provider routing, sequencing, expiry, evaluation, and unavailable keys. Run the focused Jest suite and confirm missing implementation failures.
- [x] Implement context resolution and document extraction (5 MB PDF/DOCX, reviewed text); persist source snapshots and turns. Validate DTOs and ownership. Use database locks to serialize turns and finish requests, with idempotent turn IDs. Run focused tests to green.
- [x] Implement OpenAI credential creation and DeepSeek text turns using documented provider endpoints. Keep permanent keys server-side, bound request times, and validate provider responses. Implement structured feedback with evidence excerpts. Test failures and routing without live credentials.
- [x] Write browser transport tests for missing microphone, text mode, event transcript parsing/deduplication, resource teardown, interruption, and failures. Run Vitest to confirm failures, implement adapters, and rerun.
- [x] Write UI tests covering document review, level, searchable subjects/notes, language/provider, required setup, preview, start/stop, failed requests, and feedback. Run to confirm failures before implementing. Match existing paper/forest-green workspace styling, with an editorial interview brief and focused live conversation.
- [x] Integrate the interview route into navigation. Document env configuration, migrations, browser speech privacy, and live checks. Run backend and frontend suites, API build, web build, and lint.
- [x] Independently review authorization, transcript synchronization, concurrency, cleanup, and provider failures. Fix material issues and repeat relevant checks only.

## Acceptance checks

An unavailable provider cannot start. Foreign library IDs and session IDs cannot be accessed. Selected subject notes are deduplicated and previewed; oversized context is rejected without clipping. Source text is data rather than instructions. DeepSeek requires no OpenAI key. OpenAI credential responses expose no permanent secret. Ending an interview shuts down local audio before evaluation. Finished transcripts and feedback can be reloaded after restart. Failures remain recoverable without changing provider or duplicating answers.

## Verification results

- API: 153 tests passed; 12 existing opt-in database integration tests skipped.
- Web: 107 tests passed, including 10 interview UI cases and 15 audio transport cases.
- API and web production builds passed. API lint passed with existing warnings; new interview frontend lint is clean.
- Independent review found and verified fixes for conversation continuity, final transcription draining, feedback retries, and multilingual request limits.
- Visually checked the responsive setup screen using a local fixture preview. No paid provider calls, real microphone checks, database migration execution, or deployment were performed.
