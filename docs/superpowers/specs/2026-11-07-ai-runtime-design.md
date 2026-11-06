# AI runtime reliability and remote personal ChatGPT

Approved by user on 2026-11-07: implement the proposed local configuration,
120-second DeepSeek timeout, reduced Redis traffic, and forwarding-based ChatGPT
connection (the recommended option). Existing unrelated working-tree edits stay intact.

## Environment boundaries

Local web, API and Google callback use localhost:3000/4000. Local API uses the
existing local PostgreSQL and Redis, never the production queue. Keep provider
keys and model selections. Production environment values are not changed by
local startup. Local ChatGPT credentials use their own private directory.

## Provider calls

DeepSeek timeout defaults to 120000 ms; DEEPSEEK_TIMEOUT_MS allows 1000–120000 ms.
OpenAI API calls keep their existing 30-second timeout. Validate timeout values,
bound them, preserve caller cancellation and cover the response body as well as
headers. Existing five-minute job expiry and at-most-two attempts stay in place.
Log failed/retrying jobs with ID, action, provider, attempt, elapsed time and safe
error code, without request content, credentials or upstream response bodies.

## Redis work

Scan undispatched durable jobs every five seconds and enqueue directly using the
existing deterministic ID. Reconcile already-dispatched active jobs once per
minute, including missing Redis entries and interrupted finalization. Separate
deadline/retention maintenance from Redis backoff. On queue failure, retry Redis
with exponential backoff capped at one minute while maintaining durable cleanup.
Keep durable maintenance running even while an initial Redis connection is unresolved, with a separate single-dispatch guard. Use longer idle blocking and stalled checks (60 seconds) in BullMQ; preserve lock
renewal and retry behavior. Redis still receives worker maintenance commands;
zero commands while idle is not an objective. Batch reconciliation fairly.

## Personal ChatGPT on a hosted API

Accept an HTTPS WEB_ORIGIN as well as local HTTP origins. The OAuth callback
remains exactly HTTP 127.0.0.1 with /chatgpt/callback and no credentials, query or
fragment. An authenticated connect request may select a loopback port in
1024–65535; bind the exact URI to the pending attempt, PKCE, state, nonce and
browser cookie. Public authorize/callback endpoints only serve loopback Host.
Return to the configured web origin and a validated relative path.

Status identifies hosted forwarding mode and its default callback port. The UI
explains the need for forwarding and accepts the local forwarded port before
starting OAuth. Tokens stay on the API server, encrypted in a persistent private
volume with its own stable host ID. One API replica remains required. A tunnel
is required only while connecting/reconnecting; inference and refresh run on the
server afterwards. This is a private self-hosted workflow, not a general hosted
website OAuth integration or automatic API-key fallback.

Protect OAuth code/state/ticket values from request logs by omitting URL queries.

## Verification

Use fake timers and mocked providers to test delayed responses, timeout bounds,
body-read timeouts and cancellation. Test dispatch cadence, idempotent dispatch,
reconciliation and backoff with controlled dependencies. Run PostgreSQL/Redis
integration tests only against disposable local resources. Test hosted OAuth
end-to-end with mocked signed identity/token responses, exact callback URI,
browser binding, replay rejection, and invalid origins/ports. Verify frontend
forwarding instructions and validation. Build API and run relevant suites.
Real OpenAI consent remains an interactive deployment verification step.

Sources:
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://docs.bullmq.io/guide/going-to-production
