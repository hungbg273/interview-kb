# AI runtime reliability implementation plan

> **For agentic workers:** Execute inline, task by task; request an independent code review after verification. User explicitly approved implementation.

**Goal:** Restore local routing, allow slower DeepSeek calls, reduce Redis traffic and support remote personal ChatGPT via loopback forwarding.

**Architecture:** Keep PostgreSQL durable jobs and BullMQ execution. Separate new dispatch from periodic reconciliation. Retain the existing browser-bound OAuth handshake, adding hosted return origins and per-attempt loopback ports.

**Tech Stack:** NestJS, TypeORM, BullMQ, Next.js, Jest and Vitest.

---

### Task 1: Local environment
- [x] Set ignored `.env` WEB_ORIGIN to http://localhost:3000, NEXT_PUBLIC_API_URL to http://localhost:4000 and GOOGLE_CALLBACK_URL to http://localhost:4000/auth/google/callback.
- [x] Set DATABASE_URL and REDIS_URL to the existing local services; set CHATGPT_REDIRECT_URI to http://127.0.0.1:4000/chatgpt/callback and a separate local credentials directory.
- [x] Match apps/web/.env.local and preserve all provider credentials. Verify by parsing only non-secret URL parts.

### Task 2: DeepSeek timeout and error visibility
- [x] Add tests in apps/api/src/ai/llm.client.spec.ts for a DeepSeek response after 30 seconds, expiry at 120 seconds, bounded configuration, body timeout and caller abort. Assert `AI_TIMEOUT` for expired requests.
- [x] Run `npm run test -w api -- --runInBand llm.client.spec.ts`, confirm new cases fail.
- [x] Update llm.client.ts timeout resolution and ai.service.ts provider environment; preserve OpenAI's 30000 ms timeout. Validate configured values before constructing the timer.
- [x] Add safe failure logs in ai.processor.ts and assertions in ai.processor.spec.ts for retry/failure without leaking content.
- [x] Rerun the focused suites.

### Task 3: Redis command reduction
- [x] Add ai-dispatcher.service.spec.ts with fake time and a durable-dispatch model: new jobs enqueue without getJob; already dispatched jobs are checked at most once per minute; missing jobs re-enqueue; failure backoff does not stop expiry cleanup.
- [x] Run the dispatcher suite and confirm the expected failures.
- [x] Update ai-dispatcher.service.ts to scan every 5000 ms, reconcile every 60000 ms, clean retained data every 30000 ms and back off Redis separately. Mark dispatched_at after acknowledgement and order reconciliation by oldest dispatch.
- [x] Set worker drainDelay/stalledInterval to 60 seconds in ai.processor.ts, retain lease renewal.
- [x] Adapt the existing outage integration test to fail queue.add for a fresh dispatch; add real recovery coverage.
- [x] Run local-only integration tests with RUN_AI_JOBS_INTEGRATION=1, DATABASE_URL pointing to localhost and REDIS_URL pointing to localhost.

### Task 4: Hosted personal ChatGPT
- [x] Extend chatgpt.connection.spec.ts with HTTPS web origin, per-attempt port and full signed-token finish coverage. Reject public HTTP origins, non-loopback callbacks, unsafe return paths and invalid ports; preserve replay/cookie tests.
- [x] Run connection tests and confirm the new hosted cases fail.
- [x] Update config(), begin() and status() in chatgpt.connection.ts; add optional validated loopbackPort to ConnectDto. Restrict authorize/callback Host to 127.0.0.1. Preserve existing token encryption, stable host ID and refresh ownership.
- [x] Add controller tests for Host and DTO validation. Omit query strings in HTTP request logging.
- [x] Add frontend tests for forwarding instructions, port selection and validation in ChatgptConnectionPanel.test.tsx. Implement the corresponding small form in ChatgptConnectionPanel.tsx.
- [x] Update docs/chatgpt-connection.md with Northflank forwarding, persistent volume, single replica and the production/local settings. Update .env.example and docs/ai-background-jobs.md with timeout/cadence settings.

### Task 5: Verification and restart
- [x] Run API tests, frontend tests and API build. Review the diff for unrelated edits and secret exposure.
- [x] Request an independent code review, address substantive issues and rerun affected checks.
- [x] Restart local API/web; verify health, local Google redirect and browser login page. Inspect idle Redis command counts over a bounded window and report measured results.
- [x] Report that production requires deployment of these changes, a persistent ChatGPT credentials volume and interactive consent via forwarding. Do not claim real provider consent or inference was tested without doing it.

## Validation results

- API and web production builds passed. Web reports existing lint warnings outside this change.
- Full API and frontend suites passed; PostgreSQL/Redis integration passed 8/8 using disposable local resources.
- Independent review found a Redis-readiness maintenance stall. A regression test failed before the fix and passed after separating maintenance and dispatch guards; reviewer approved the fix.
- Idle local Redis sampling (20 seconds each): previous worker settings 28 commands, new settings 5 commands, both including four Docker health-check PINGs. This is an observed sample, not a production quota guarantee.
- Local API health, web response and CORS verified. Google authorization redirects to http://localhost:4000/auth/google/callback; Chrome displays the local login page.
- Deployment and real OpenAI consent were not performed. Hosted personal ChatGPT requires the new API/web deployment, a persistent credentials volume, one API replica and forwarding during consent.
