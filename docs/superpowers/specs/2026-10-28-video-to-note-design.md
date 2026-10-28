# Video-to-Note (transcript → AI summary → note) design

Status: Approved by user (brainstorm 2026-10-28)

## Summary

Let a user paste a **video link** (YouTube, TikTok, Facebook). The system fetches the
video's **spoken transcript** via a third-party transcript API, runs the existing AI
pipeline to produce a **structured Markdown summary**, shows it in the existing AI job
**preview modal**, and lets the user **save it as a new note** (or discard).

This reuses the existing AI background-job infrastructure (BullMQ + transactional outbox +
SSE), the `AiJobPreviewModal`, the LLM pipeline, and `POST /notes`. The only genuinely new
pieces are a transcript client and a video job entry point.

## Goals

- Paste a video URL → get an AI Markdown summary → save as a new note, running in the
  background with live status (SSE), consistent with the document-import flow.
- Support YouTube, TikTok, Facebook via a single third-party transcript API (URL →
  transcript). No ffmpeg / yt-dlp / Whisper / self-hosted STT.

## Non-goals (YAGNI)

- No self-hosted audio download or speech-to-text. OpenAI `/v1/audio/transcriptions` is
  **not** used: it only accepts uploaded audio files, not video URLs, so it would still
  require yt-dlp + ffmpeg. Explicitly out of scope for this feature.
- No appending to an existing note from the video flow (only "save as new note").
- No per-user transcript-provider keys; a single server-side key.
- No video download, thumbnails, or playback in the app.

## Decisions (from brainstorm)

- **Sources:** YouTube, TikTok, Facebook.
- **Content:** real spoken transcript, obtained from a **third-party transcript API**
  (URL in → transcript out). HTTP only on our backend.
- **AI output:** structured Markdown summary (reuses `markdown-format` + `VIETNAMESE_STYLE`).
- **Save:** create a **new note** from the preview modal, or discard.
- **Execution:** **background job**, reusing the existing AI-jobs system.

## Architecture

```
User pastes link (web)
  → POST /ai-jobs/video { videoUrl }         [job row + outbox row, one transaction]
  → AiDispatcher enqueues (BullMQ)
  → AiProcessor.generate (video branch):
        1. TranscriptClient.fetch(videoUrl) → { platform, title, text }
        2. AiService.summarizeVideo(text)   → markdown   (two-pass if long)
  → finalize: result = { markdown, title, sourceUrl }   (noteId = null)
  → SSE "succeeded"
  → AiJobPreviewModal shows markdown
  → "Save as new note" → POST /notes { title, bodyMarkdown } → /notes/:id
```

### Components

**New**

- `TranscriptClient` (backend, in a `video/` area or alongside `ai/`).
  - Input: `videoUrl`. Output: `{ platform: 'youtube'|'tiktok'|'facebook', title, text }`.
  - Detects platform from URL host; rejects others with `AppError.validation`.
  - Calls the transcript vendor via `fetch` with an `AbortController` timeout (~60s).
  - Strips `\u0000`; clips `text` to `MAX_DOCUMENT_CHARS` (30000).
  - Config: `TRANSCRIPT_API_URL`, `TRANSCRIPT_API_KEY`. Missing key →
    `AppError.aiNotConfigured`.
- `POST /ai-jobs/video` endpoint + `VideoJobDto { videoUrl }` (class-validator `@IsUrl`),
  modeled on `POST /practice/import-jobs` but JSON instead of multipart. Requires a UUID
  `Idempotency-Key` header; inherits the 3-active-jobs-per-owner limit.
- New AI action `summarize-video` with its prompt branch in `AiService`.
- Frontend entry point to paste a URL and start the job, plus a "Save as new note" action
  in `AiJobPreviewModal`.

**Reused unchanged**

- AI job state machine, outbox dispatcher, SSE (`ai-jobs/`).
- `AiService.prepare/generate`, `LlmClient.complete`, prompts, two-pass long-input
  condensation (`PracticeImportService.generateDraft` pattern) and `clipText`.
- `AiJobPreviewModal` + `MarkdownPreview`.
- `POST /notes` + `CreateNoteDto`.

## Data flow, types, config

### Shared types (`packages/shared`)

- `AiAction` gains `'summarize-video'`.
- `AiJobView.action` union extended to include the new action (as `'import-document'` was).
- `AiJobResult` reuses `markdown`; adds optional `title?: string` and `sourceUrl?: string`.

### Job payloads

- `ai_job.input.video = { videoUrl }` (jsonb).
- `result = { markdown, title, sourceUrl }` (jsonb). `noteId` stays null.

### Config (add to `.env.example`)

- `TRANSCRIPT_API_URL` — vendor endpoint.
- `TRANSCRIPT_API_KEY` — vendor key.
- Availability gating mirrors `OPENAI_API_KEY`/`DEEPSEEK_API_KEY`: missing key disables the
  feature and returns `AppError.aiNotConfigured` on job creation.

### Database

- **No new migration.** Reuses `ai_job` + `ai_job_dispatch`; `note_id` already nullable
  (ImportJobs migration). `input`/`output`/`result` are jsonb.

## Error handling

| Case | Handling | Result |
|---|---|---|
| URL not YouTube/TikTok/Facebook | `AppError.validation` (DTO + client) | 400, clear message |
| Missing `TRANSCRIPT_API_KEY` | `AppError.aiNotConfigured` | 503, "not configured" |
| Vendor timeout / 5xx / network | `AppError.aiUpstream`, logged as JSON (pino) | 502, retryable |
| No transcript (private / no speech) | `AppError.validation` (unrecoverable) | job failed, not retried |
| Empty / oversized transcript | guard empty; clip 30000 + strip `\u0000` | job failed with message |
| Empty / oversized LLM markdown | existing guard (`ai-jobs.service.ts`) | job failed, retryable |
| Job failure | reuse `POST /ai-jobs/:id/retry` + `failed` state | tray shows retry |

Transient (vendor 5xx/timeout) → retryable; permanent (bad URL, no transcript) →
`UnrecoverableError`, matching `AiProcessor.canRetry`.

## Testing (agent-written, to verify after implementation)

- `TranscriptClient`: mock `fetch`; platform detection, vendor-error → `AppError.aiUpstream`,
  `\u0000` strip, length clip, non-supported URL rejection.
- `AiService.summarizeVideo`: mock LLM; markdown prompt + two-pass when text is long.
- Video `generate` branch: mock client + service; `result = { markdown, title, sourceUrl }`,
  `noteId` null.
- `VideoJobDto`: rejects empty/invalid/non-supported URLs.
- Frontend modal: "Save as new note" appears only for `summarize-video` with markdown; click
  calls `POST /notes` with the right payload.
- No real network calls to the vendor (always mocked).

## Rollout

- Feature is inert until `TRANSCRIPT_API_URL` + `TRANSCRIPT_API_KEY` are set; availability
  endpoint reports it as unavailable otherwise, so the UI can hide/disable the entry point.
