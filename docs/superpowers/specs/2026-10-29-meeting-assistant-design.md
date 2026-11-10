# Meeting assistant backend

Approved direction: integrate the browser meeting assistant into this API, using
cloud AI and caller-supplied personal and participant context. User authorized
implementation on 2026-10-29. This increment implements the backend only.

## Transport and boundaries

Use authenticated HTTP requests with independently decodable PCM WAV segments
(1–10 seconds, mono, 16 kHz, 16-bit). Each segment is transcribed by OpenAI and
translated using the existing LlmClient (OpenAI or DeepSeek). This is chunked
near-live processing, not continuous streaming or a WebSocket implementation.
Clients must wait for each response and queue or pause capture rather than drop
segments. Do not send arbitrary MediaRecorder timeslices without WAV encoding.

Sessions are in process memory, owner-scoped, expire after 2 hours, and permit
one active session per account, 100 sessions globally. This increment requires
one API instance; restart loses all sessions. No database or Redis persistence.
Context and a bounded recent transcript are deleted on stop/expiry/shutdown.
Provider processing is external and follows the provider's retention policy.

## Contracts

- POST /meetings: provider (openai/deepseek), sourceLang (en/vi), targetLang
  (en/vi), context {personal, project, participants, meeting}; returns session.
- GET /meetings/:id: metadata and recent segments, never audio or secrets.
- PATCH /meetings/:id/context: replaces all context atomically; omitted fields
  clear previous values. Reject during another session operation.
- POST /meetings/:id/audio: multipart file plus sequence (integer starting at 0).
  Validate canonical WAV and file limit (320044 bytes) before calling AI.
  Return {sequence, text, translation}. Matching retry returns cached result;
  changed bytes or out-of-order sequence returns 409. No auto retry upstream.
- POST /meetings/:id/suggestions: optional draft (Vietnamese or English).
  Return {reply, explanation}; require recent speech or a nonempty draft.
- POST /meetings/:id/stop: abort pending calls, remove session, return stopped.
  Stop is idempotent for a missing session; operations return 404 afterwards.

One provider operation runs per session. Limit attempts per session to 1600
and suggestions to one per 2 seconds. Count failed calls too. Enforce a 30-second
operation deadline and abort on stop, expiry, shutdown, or client disconnect.
Keep at most 50 recent segments / 20000 text characters. Each context field is
bounded to 4000 characters. Never log context, provider bodies, audio or credentials.

## Security and reuse

Keep global cookie JWT guard and account interceptor. Do not broaden CORS or
change existing login rules. Extension integration must verify cookie behavior
and host permissions before release. Context is provided text only; no uploads,
shared context CRUD, or automatic library retrieval in this increment.
Separate trusted instructions from untrusted context/transcript/draft. Suggestions
must not invent personal facts or commitments. Output remains a suggestion.
Reuse LlmClient with optional caller cancellation; existing consumers unchanged.
Use dedicated meeting speech client; existing video TranscriptClient is unrelated.

## Verification

Test account isolation, expiry/stop cancellation, concurrency, limits, audio
validation, sequence retry rules, context replacement, provider requests/errors,
structured suggestions and HTTP validation/auth metadata. Run targeted tests,
API build/lint and API regression tests. Mock cloud calls; live Meet/Teams capture
and paid provider access require later extension smoke tests.

## Caption transport increment

User subsequently requested reading visible Meet/Teams Live Captions instead of
uploading WAV. The separate meeting-extension project now contains an unpacked
Chrome extension; its primary API input is JSON text. Session setup accepts
inputMode=captions. POST /meetings/:id/captions validates sequence, utteranceId,
text and optional speaker, caches the last exact retry, and replaces prior
revisions of the same utterance. DeepSeek caption sessions do not require speech
credentials. Original audio endpoints remain compatible for existing callers.
See docs/meeting-assistant.md for current endpoint details and limits.
