# Browser meeting assistant API

Backend for a Chrome extension used with Google Meet and Teams in the browser.
An unpacked extension now lives in the separate meeting-extension project.
Its default transport reads visible captions and calls the text endpoint below.

## Run and configuration

Use the existing root `.env`, database, login and development workflow:

```sh
npm run dev:api
npm run build -w api
npm run test -w api -- --runInBand --testPathPatterns=meetings
npm run lint -w api
```

- `OPENAI_API_KEY` is required for audio sessions and OpenAI text generation.
  Caption-only DeepSeek sessions need only `DEEPSEEK_API_KEY`.
- `OPENAI_BASE_URL` and `OPENAI_MODEL` use existing LlmClient configuration.
- Optional `MEETING_TRANSCRIBE_MODEL` defaults to `gpt-4o-mini-transcribe`.
- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL` are used only when
  `provider` is `deepseek`. There is no automatic provider fallback.
- No new dependency, table, migration or background queue is required.

Speech uses the documented [file transcription API](https://developers.openai.com/api/docs/guides/speech-to-text).
Model access/billing must be verified with your own account. No paid calls were
made during automated verification.

## Authentication

Every endpoint uses the existing `kb_access_token` HTTP-only cookie JWT and
account interceptor. Sign in through the existing web app. Bearer tokens are not
accepted by the current JWT strategy. Permanent cloud API keys stay on the API.

Extension requests should originate in the extension background/offscreen context,
with explicit API host permissions and credentials included. Do not send requests
from the Meet/Teams page context or inject login credentials into those pages.
CORS and cookie configuration have not been broadened. Verify cookie SameSite,
HTTPS, host permission and login behavior in the actual extension before release;
a dedicated extension authentication flow is not part of this increment.

## Start and context

`POST /meetings` returns 201 and a `MeetingSession`:

```json
{
  "provider": "openai",
  "sourceLang": "en",
  "targetLang": "vi",
  "context": {
    "personal": "Frontend engineer. Prefer simple English.",
    "project": "Checkout UI is complete; backend API is pending.",
    "participants": "The other participant is the project manager.",
    "meeting": "Discuss progress; no confirmed delivery date."
  }
}
```

Each context field is optional, text-only, at most 4000 characters. `context` is
required but may be `{}`. Source and target can each be `en` or `vi`. Context
profiles, document uploads and automatic retrieval from libraries are not provided.

`GET /meetings/:id` returns the session and recent segments. Other accounts see
404. `PATCH /meetings/:id/context` **replaces all context** with the supplied
object; omitted fields are cleared. This affects subsequent suggestions. Translation
uses selected context and up to six recent speech segments as untrusted reference,
with each reference segment bounded to 1000 characters. Uncertain meaning is
marked rather than treated as a confirmed fact; original captions are preserved. All successful endpoint responses use `Cache-Control: no-store`.

## Live caption text (preferred extension transport)

Create the session with `inputMode: "captions"`. Existing callers omitting this
field retain audio behavior. Caption sessions do not require speech credentials
when their text provider is DeepSeek, and reject audio uploads.

`POST /meetings/:id/captions` accepts JSON:

```json
{ "sequence": 0, "utteranceId": "caption-row-uuid", "text": "Hello team", "speaker": "Alice" }
```

Text is trimmed, required, 1–4000 characters. Speaker is optional, up to 200;
utteranceId is required, up to 100. Return includes these fields and `translation`.
Use the next sequence on every accepted update, including revisions to the same
utteranceId. Recent history replaces earlier revisions of that utterance, so AI
suggestions do not receive every intermediate snapshot. The immediately previous
identical request is cached; modified bytes/fields at an old sequence return 409.

Capture original-language captions and pass matching sourceLang. The API cannot
verify captions or speaker identity supplied by the browser; treat them as untrusted.
DOM extraction is an extension concern, not a Google/Microsoft live-caption API.

## Audio

`POST /meetings/:id/audio`: multipart form fields:

- `file`: one complete canonical PCM WAV file, mono, 16 kHz, signed 16-bit,
  44-byte header, 1–10 seconds, at most 320044 bytes.
- `sequence`: integer starting at `0`, then increasing by one per successful segment.

```json
{ "sequence": 0, "text": "When can you finish?", "translation": "Khi nào bạn có thể hoàn thành?" }
```

This is **chunked HTTP processing**, not continuous WebSocket streaming. Encode
independent WAV segments in the extension; concatenated or headerless
MediaRecorder chunks are invalid. Queue bounded audio on the client and send the
next segment only after a response. Silence can return empty strings.

Only the immediately previous successful sequence with identical bytes can be
retried without a new AI call. Changed bytes, older sequences or gaps return 409.
A failed operation leaves the sequence unchanged. Retrying a failed request can
incur additional provider charges; retries after a lost connection may also bill
again if the server could not complete the cancelled operation. No automatic
provider retries occur.

## Suggestions and stop

`POST /meetings/:id/suggestions` with `{ "draft": "Tôi cần kiểm tra với backend" }`
or `{}` when recent speech exists returns:

```json
{ "reply": "Let me check with the backend team.", "explanation": "Bạn cần xác nhận thông tin trước khi trả lời." }
```

Suggestions combine selected context, recent speech and optional draft (at most
2000 characters). Output is English with a Vietnamese explanation. Nothing is
spoken or sent automatically. Review suggestions: prompts discourage invented
facts and commitments but cannot guarantee model accuracy.

`POST /meetings/:id/stop` returns `{ "status": "stopped" }`, cancels in-flight
provider work and deletes context/transcript from the session store. Repeating
Stop is safe. Missing or foreign sessions also return stopped without disclosure.
The extension must separately stop its own media tracks and queued uploads.

## Lifecycle, limits and retention

- **Single API instance only.** Sessions live in process memory, not Redis or
  Postgres. Restart loses sessions. Do not use multiple replicas without replacing
  the session store and coordinating locks/cancellation across instances.
- Sessions expire after two hours; one active session per account, 100 globally.
- One AI operation per session at a time; context edits during it return 409.
- Maximum 1600 operation attempts per session, including failed requests.
  Suggestions are limited to one attempt every two seconds.
- Operations have a 30-second deadline and cancel on client disconnect, Stop,
  expiry or API shutdown. Cancellation cannot reverse provider charges/work
  already accepted upstream.
- Recent history is bounded to 50 segments and 20000 combined characters; older
  segments are evicted. No full meeting history or speaker attribution is provided.
- Uploaded audio is processed in RAM, never written to disk by this module. The API
  does not persist context or transcripts, and request bodies are not logged by
  its existing logger. Cloud providers receive audio/text as required and follow
  their own retention policies. Stop cannot delete previously transmitted data.

Malformed input returns 400; oversized upload 413; missing/foreign/expired session
404; concurrency, sequence and session limits 409. Provider availability/failure
uses existing `AI_NOT_CONFIGURED` / `AI_UPSTREAM` errors. Cancelled operations
return 409 where the client connection still exists.

## Verification and remaining manual checks

Tests use actual Nest HTTP routes, validation, multipart parsing, cookie JWT guard
and account interceptor with a mocked account repository and AI calls. Unit tests
cover session ownership, lifecycle, cancellation, sequence behavior, WAV limits and
provider output validation. Local HTTP tests need permission to bind a loopback port.

Before release, verify browser capture and WAV encoding in both Meet and Teams,
login/cookie behavior, live provider access, latency/translation quality, silence,
client queue/backpressure, network recovery, and that Stop closes media tracks.
