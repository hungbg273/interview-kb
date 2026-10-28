# Mock interviews

Open **Phỏng vấn thử** in the navigation, or visit `/interview` after signing in.

1. Optionally upload a JD, CV, or both as text-based PDF or DOCX files up to 5 MB each. Change **Document type** before uploading each kind. Review and correct the extracted text; use **Edit JD/CV** to switch the reviewed document and **Remove JD/CV** to discard it. Scanned PDFs require OCR before upload.
2. Select fresher, junior, middle, senior, or expert as the target level.
3. Optionally search and select subjects or individual notes from your library. A subject includes its directly linked notes; overlapping selections are deduplicated. At least one source is required overall: a JD, a CV, a subject, or a note. You may combine all of them for more context.
4. Choose English or Vietnamese, OpenAI or DeepSeek, and a duration.
5. Review the resolved sources and start. You can start without a microphone and type answers.

Each document is limited to 30,000 characters; combined JD/CV/library context is limited to 40,000 characters and 100 notes. One JD and one CV can be kept per interview. Oversized selections are rejected with instructions to reduce the context rather than silently clipped. Empty or whitespace-only uploaded documents must be corrected or removed. Review does not call a paid model. Starting shares the reviewed documents and resolved library context with the selected provider. Library-only interviews use the selected materials without inventing a JD or candidate background. Existing saved single-document interviews remain readable.

## Server setup

Use the existing root `.env` to configure provider keys. Never put permanent keys in `NEXT_PUBLIC_*` variables.

```dotenv
# OpenAI: native speech-to-speech plus text-model evaluation
OPENAI_API_KEY=your-openai-key
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_MODEL=gpt-4o-mini

# DeepSeek: questions and evaluation, with browser speech
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
INTERVIEW_DEEPSEEK_MODEL=deepseek-flash
```

Configure either provider or both. Unconfigured choices are disabled. `INTERVIEW_DEEPSEEK_MODEL` applies to interview questions and feedback; `DEEPSEEK_MODEL` continues to control existing AI features. ChatGPT account sign-in connections are separate from OpenAI API authentication and do not enable native interview audio. API billing/access must be available for the configured models.

If DeepSeek uses a custom OpenAI-compatible gateway, keep its existing `DEEPSEEK_BASE_URL` and set `INTERVIEW_DEEPSEEK_MODEL` to the model identifier supported by that gateway. The direct DeepSeek model name in the example may not exist on another gateway.

### Existing Docker Compose setup

After configuring the root `.env`, rebuild and recreate the API:

```sh
docker-compose build api
docker-compose up -d --no-deps --force-recreate api
docker-compose logs --tail 30 api
```

The API container automatically applies pending migrations before starting. For the interview feature, expect `Applied migrations: Interviews1760000000009` on its first startup and `Nest application successfully started`. Existing volumes and library data are preserved. The web service already mounts source files; recreate it only if the Compose volume configuration changed. Use `docker compose` instead of `docker-compose` when installed as a CLI plugin.

An API key or a successful model-list/voice-credential request does not guarantee funded inference access. If a provider returns HTTP 429 with `insufficient_quota` or `credit_balance_exhausted`, add credits or resolve that provider account's billing before starting interviews. This is separate from ChatGPT subscription billing; switching configured models does not fix an exhausted account balance.

### Running without Docker

Apply the new owner-scoped session migration before starting the API:

```sh
npm run migration:run -w api
npm run dev:api
npm run dev:web
```

Run these commands against your intended development database. The migration creates `interview_session` and leaves existing library data intact. Deployment must apply migrations before serving the new endpoints. Docker Compose forwards `.env` into the API container.

## Voice behavior and privacy

Choose **Interviewer voice** in setup, then **Preview voice** to hear a short sample in your chosen interview language. DeepSeek shows at most ten quality-filtered browser voices with locale labels such as `en-US`, `en-GB`, or `vi-VN`. Only Natural, Neural, Enhanced, or Premium engine metadata qualifies; basic/compact and novelty voices are excluded from both selection and playback. Duplicate quality variants are collapsed. If no qualifying voice is installed, the app explains this and keeps typed interviews available. It will not fall back to a basic voice or another language. See [the quality policy and research](voice-quality.md).

OpenAI offers only **Marin and Cedar**, its documented quality recommendations. Its preview calls the Speech API using `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`) and therefore uses API credits. Browser previews do not call the app's paid speech API, though browser voice services may be remote. An OpenAI preview does not use browser speech as a substitute: billing/access errors are shown directly. The chosen voice is saved with the session and used for live output; it cannot be changed during an active interview. Previously saved excluded voices are no longer played; start a new session to choose an allowed OpenAI voice.

OpenAI uses WebRTC and a short-lived credential minted by the authenticated API. Audio goes directly from the browser to OpenAI. Permanent provider keys never leave the server. A maximum of three native voice connections is allowed per session. Reconnection restores the saved conversation rather than starting over.

DeepSeek uses browser speech recognition for dictation and browser speech synthesis for questions. It requires no OpenAI key. Recognition availability varies by browser/language and may send audio to the browser vendor. Users are told this before activation. Dictation fills an editable answer; the user submits it explicitly. Missing/denied microphone or speech support has a typed-answer fallback. HTTPS or localhost is required for microphone access. The interviewer voice is synthetic; no avatar or video capture is included.

Finish stops the microphone and playback immediately, allows up to two seconds for committed OpenAI transcript events to arrive, saves the transcript, then evaluates it. A visible warning reports incomplete final transcription. Session expiry rejects further model turns on the backend and closes audio in the browser. Because native WebRTC connects directly to OpenAI, the application deadline is not a provider-side revocation mechanism for modified clients.

## Saved sessions and failures

Sessions, source snapshots, transcripts, and feedback are stored in PostgreSQL and scoped to the signed-in account. **Open last interview** reloads the latest session opened in this browser, including after server restart. There is no cross-device history list yet. Do not share database backups containing CVs or private notes unintentionally.

Provider failures do not switch providers. DeepSeek answer retries preserve the answer ID and question sequence. Failed transcript saves retain pending turns while the page is open; retry finishing before navigating away. Feedback can be retried after the session ends. Scores and feedback are AI-generated practice guidance based on transcript content, not pronunciation or hiring decisions.

## Verification

### Development build isolation

Development uses `.next-dev`; production build/start use `.next`. Docker Compose mounts a private `web-next-dev` volume at `/repo/apps/web/.next-dev` so host and container manifests never share absolute module paths. After updating Compose, recreate only the web service with `docker-compose up -d --no-deps --force-recreate web` (or `docker compose` if your installation provides the plugin). This also recovers a development server that read host-generated client manifests. Existing database volumes do not need to be removed.

The web container sets `WATCHPACK_POLLING=true` because Colima bind mounts may not forward host file-change events reliably. This ensures source edits trigger recompilation rather than continuing to serve an older form. If setup cannot continue, the text beside **Review interview** explains whether context is missing, an uploaded document is empty, providers are still loading, or a provider is unavailable.

```sh
npm test
npm run build -w api
npm run build -w web
npm run lint -w api
```

Automated provider calls are mocked and do not validate live account access. Database integration suites are opt-in through the repository's existing integration environment switches. HTTP parser tests open temporary local sockets. The web build downloads the existing Google Fonts and needs network access on a clean cache.

For a live smoke test, start one short interview with each configured provider, verify the chosen language and contextual follow-up, submit a typed answer, test mute and reconnect, finish, and reopen the saved transcript/feedback. Check microphone indicators turn off on finish/navigation. Do not expose or paste your permanent API key in the browser.
