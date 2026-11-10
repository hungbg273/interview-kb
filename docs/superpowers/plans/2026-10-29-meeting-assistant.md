# Meeting Assistant Implementation Plan

> Execute inline in this session. User explicitly authorized implementation.

**Goal:** Add authenticated meeting audio transcription, translation and contextual reply suggestions.

**Architecture:** A new MeetingsModule owns short-lived, account-scoped in-memory
sessions. A dedicated speech client calls OpenAI; LlmClient handles text generation.

**Tech Stack:** Existing NestJS, TypeScript, class-validator, Jest, Node fetch.

## Tasks

- [x] Add failing tests in `apps/api/src/meetings/meetings.service.spec.ts` for
  session isolation, lifecycle, cancellation, sequence handling and context use.
- [x] Add failing tests in `apps/api/src/meetings/meeting-ai.spec.ts` for canonical
  WAV validation, bounded provider responses and structured text generation.
- [x] Run `npm run test -w api -- --runInBand --testPathPatterns=meetings`;
  observe missing feature failures before implementation.
- [x] Add `packages/shared/src/meeting.ts` and export its contracts.
- [x] Add meeting DTOs, session store, speech/text AI client, service, controller
  and module under `apps/api/src/meetings/`; register module in `app.module.ts`.
- [x] Add optional `signal` to `LlmClient.complete`, composing with its existing
  timeout and checking cancellation before network use.
- [x] Add HTTP validation/integration tests with mocked providers and account
  interceptor; verify unauthorized access and multipart rejection before AI.
- [x] Run focused tests, `npm run build -w api`, `npm run lint -w api`, then
  `npm run test -w api -- --runInBand`; report unrelated failures accurately.
- [x] Document endpoint payloads, limits, single-instance requirement, retention,
  authentication constraints and manual verification in `docs/meeting-assistant.md`.

No automatic commits, deployments, migrations, dependency installs or paid calls.

## Observed validation

- API Jest regression: 41 suites passed, 2 skipped; 212 tests passed, 12 skipped.
- Meeting suites: 22 tests included in the regression run.
- API build passed. Lint exited successfully with six warnings in pre-existing files.
- Independent review found context arrays bypassing the intended object bound;
  regression reproduced the issue and `IsObject` fixed it. Reviewer confirmed.
- Tests use mocked AI. No paid calls, browser extension capture, deployments,
  migrations or commits were performed. Local HTTP tests required loopback access.
- New Markdown docs are explicitly unignored because the machine's global ignore
  excludes Markdown; existing local `.gitignore` edits were preserved.
