# English and Vietnamese interview voice selection

The user accepted voice selection and preview for both languages. Extend existing provider flows without adding another speech vendor.

- [x] Add an optional voice selection to session setup; keep old sessions valid. Share supported OpenAI voice names through the existing shared package entrypoint.
- [x] Backend: validate the selected OpenAI name; preserve a bounded browser voice URI for DeepSeek. Use the selected voice for Realtime creation. Add authenticated POST /interviews/voice-preview accepting OpenAI voice and en/vi, returning bounded base64 MPEG audio from the existing OpenAI speech endpoint with a fixed localized sample. Map credit/access errors to actionable messages and keep keys server-side. Tests first for selection, validation, preview and legacy defaults.
- [x] Browser: enumerate language-matching installed voices and handle delayed voiceschanged. Respect saved voice URI, use the selected voice's locale, and provide an explicit fallback if unavailable. Keep playback cancellation and error callbacks. Tests first for locale selection, delayed voice discovery, unavailable voice and cleanup.
- [x] UI: show voice picker with names and locale labels beside language/provider. Include preview/stop; clearly label browser preview and paid OpenAI preview. Reset incompatible choices when changing provider/language. Show unavailable speech support with typed fallback. Include selection in review, persisted setup, question playback, and restore. Cancel preview on changes, start, unmount.
- [x] Verify focused and full tests, API/web builds, independent review, and rebuild/restart API. Check authenticated voice-preview validation without spending credits on the known unfunded OpenAI account.

OpenAI voice is fixed for an active interview; choose before starting. Browser voices may differ across devices. Avoid claiming every voice is native quality; let the preview guide selection. Existing no-voice sessions use Marin for OpenAI and an available language match for browser speech.

## Verification

API tests: 171 passed, 12 existing opt-in database integration tests skipped. Web tests: 127 passed. Both production builds passed. Independent review verified cancellation, fallback playback controls and persisted selection. Docker API rebuilt and restarted; health and interview page returned200; preview auth/invalid-voice checks returned401/400 without paid calls. OpenAI voice playback was not exercised because the existing account lacks credits; browser voice availability remains device-dependent.
