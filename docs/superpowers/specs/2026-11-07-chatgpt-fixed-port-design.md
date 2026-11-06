# Personal ChatGPT fixed local connector

Approved by user: use a fixed local port, 18080, so people do not copy the
temporary port allocated by Northflank into the production web app.

## Flow

`npm run chatgpt:connect` binds an HTTP listener on 127.0.0.1:18080, starts the
installed authenticated Northflank CLI forwarding the configured API service,
and discovers its actual loopback port from the CLI readiness output. After
checking the forwarded API health, the connector opens the production web app.
The hosted ChatGPT button always submits loopbackPort=18080. The connector
proxies the two OAuth GET endpoints to the forwarded API, preserving the
loopback Host and binding cookie. The production API continues to own state,
PKCE, tokens and refresh. User performs OpenAI consent.

A shared non-secret JSON config declares the fixed local port, remote API port,
Northflank project/service and production web origin. The bridge uses the
existing CLI login; no cloud API tokens are copied into source or browser.

## Safety and lifecycle

Bind only 127.0.0.1. Fail clearly if 18080 is occupied; never silently choose
another port. Match only the intended service/API port and a valid 127.0.0.1
destination. Parse buffered, bounded output including split chunks and ANSI
formatting. Restrict proxy requests to GET /chatgpt/authorize and
/chatgpt/callback; provide a local-only GET /health endpoint indicating readiness.
Reject unexpected Host headers and absolute request targets. Never log OAuth
URLs, cookies, codes or CLI authentication data. Fail startup after 45 seconds.
When the CLI exits or receives an error, close the listener and stop the child.
Handle Ctrl+C/SIGTERM, close active sockets, terminate the child with a bounded
grace period and make cleanup idempotent. Upstream errors return a friendly
503 without exposing credentials. No automatic reauthorization or consent.

## UI and compatibility

Remove the forwarded-port field. Explain the one local setup command and that
the connector must remain open through sign-in. Local app mode keeps using its
API callback directly without requiring the connector. Backend port validation
and existing OAuth guards remain unchanged, and previous dynamic-port clients
remain compatible. This connector requires a user with Northflank access;
it is for the personal self-hosted app, not arbitrary public website users.

## Validation

Node built-in tests cover output parsing, real loopback proxying of redirects
and cookies, route/Host restrictions, occupied-port failure, startup failure,
CLI exit and cleanup. Frontend tests verify no manual field, fixed-port
submission, navigation guard and unchanged local behavior. Run focused/full
frontend tests and build as appropriate; preserve unrelated working-tree work.
Independently review the connector. A live forwarding/health smoke test uses
the existing Northflank login without disconnecting the user's ChatGPT session.
