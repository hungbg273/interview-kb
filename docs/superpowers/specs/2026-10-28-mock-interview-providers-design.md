# Mock interviews with selectable providers

## Scope

Add a live mock interview screen to the existing Next.js and NestJS app. As a user, I choose a JD or CV, my target level, subjects or notes to practice, and the interview language, then start an interview tailored to those inputs. Users also select OpenAI or DeepSeek before starting. Reuse existing authentication and server-managed provider environment variables.

## Setup and source context

1. Choose JD or CV as the source and upload a PDF or DOCX (maximum 5 MB), reusing the existing document extractor. Show extracted text for review and correction; reject empty or unreadable documents before starting. Do not require a manually entered role when it can be inferred from this text.
2. Choose target level: fresher, junior, middle, senior, or expert, matching existing practice levels.
3. Select one or more subjects or notes from the user's library using searchable multi-select controls. Map subjects to the existing topics model. Subjects include their associated notes; explicitly selected notes and subject-derived notes are deduplicated. Preview the resulting source list. Subjects without notes still supply their names as focus areas.
4. Choose English or Vietnamese and OpenAI or DeepSeek. Use a 20-minute default session duration with an optional duration control.
5. Review the selected context and start. Require a readable JD/CV, a level, at least one subject or note, a language, and an available provider.

Resolve library selections on the backend with ownership checks. Snapshot the reviewed document text, chosen subject names, selected note titles and content, level, language, and provider when the session starts. Bound combined context size and explain excess selections before starting rather than silently dropping content. Treat document and note content as reference data, not executable instructions. Send relevant context to the selected AI provider only when the user starts the interview.

For a JD, prioritize role requirements and use selected materials as the practice focus. For a CV, ask about claimed experience and projects, calibrated to the selected target level and focus areas. Do not invent candidate experience or treat a CV claim as verified. Follow-ups should reference the actual answer and relevant selected context. Ask and evaluate in the chosen language even when source documents use another language.

## Provider behavior

- OpenAI: use a backend-created short-lived Realtime credential and browser WebRTC audio. Permanent API keys stay on the server.
- DeepSeek: browser speech recognition converts candidate speech to text; the authenticated backend calls DeepSeek using the existing LLM client; browser speech synthesis reads the interviewer response. This path requires only a DeepSeek API key. Feature-detect browser speech capabilities, explain limitations, and always provide typed answers and visible questions as a fallback.
- Lock provider selection during an active session. Never silently switch providers or bill another provider on failure.
- Existing ChatGPT account connections remain outside this feature's initial scope.

## Interview flow

Setup, microphone permission, introduction, one question at a time, relevant follow-ups, finish, and feedback. Support mute, stop, visible transcript, and typed input. Use an explicit answer submission control for DeepSeek so thinking pauses do not submit incomplete answers. Backend time limits bound the session; stopping closes audio connections and cancels speech playback.

## Backend and data

Add a focused interview module with authenticated document preparation, session creation, text turns, transcript handling, and final evaluation. Bind sessions and prepared documents to the authenticated owner and validate document size, context size, source type, selected library IDs, level, transcript size, duration, language, and provider. Keep the canonical DeepSeek conversation server-side. Use session IDs and turn sequencing to prevent overlapping or duplicated replies. Add a database migration for owner-scoped interview sessions, source snapshots, and transcripts so finished interviews survive restarts. Reuse the existing provider for post-interview evaluation.

## Feedback

Return correctness, depth, clarity, and relevant-example assessments with excerpts from the transcript, concrete improvements, and a suggested stronger answer. Assess content from text; do not claim to assess pronunciation from a transcript. Clearly label feedback as AI-generated practice guidance.

## Errors and configuration

Expose provider availability without revealing keys. Disable unavailable providers with actionable setup instructions. Handle denied microphones, unsupported speech recognition, upstream errors, disconnection, and expired sessions. Provide explicit retry or text fallback without duplicate turns. Document the existing keys and any new Realtime model setting in .env.example and setup documentation. Do not read or print private key values.

## Validation

Test provider routing, missing credentials, session ownership, document validation, library selection ownership and deduplication, context limits, JD versus CV prompt construction, level and language propagation, turn sequencing, feedback parsing, and session cleanup. Test the setup sequence, required fields, source preview, provider selection, capability fallback, start/stop behavior, and error rendering in the frontend. Run relevant tests and production builds. Live provider checks require configured credentials and are reported separately from mocked automated tests.

## Chosen tradeoff

Native OpenAI voice plus browser voice for DeepSeek avoids requiring another paid speech service. DeepSeek speech availability depends on browser and language support, and browser speech recognition may use browser-vendor servers. The UI must disclose this before microphone activation.
