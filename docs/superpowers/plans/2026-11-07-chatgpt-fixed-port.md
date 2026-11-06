# Fixed-port ChatGPT connector implementation plan

> **For agentic workers:** Execute inline and request independent review. User approved the fixed-port design.

**Goal:** Remove manual port entry from hosted personal ChatGPT sign-in.

**Architecture:** A local HTTP bridge on 127.0.0.1:18080 forwards only OAuth routes to the dynamic Northflank tunnel. UI and helper share non-secret settings.

**Tech Stack:** Node.js built-in HTTP, child_process and node:test; existing React/Vitest UI and Northflank CLI.

### Task 1: Connector
- [x] Add config/chatgpt-forwarding.json with localPort 18080, remotePort 4000, projectId default, serviceId interview-kb and the production web origin.
- [x] Add scripts/chatgpt-connect.test.mjs first: parse split/ANSI output; reject other services, ports and non-loopback addresses; proxy redirect/cookies with loopback Host; reject other methods/routes/Host; report port conflict and unavailable upstream; shut down on CLI failure or timeout.
- [x] Run `node --test scripts/chatgpt-connect.test.mjs` and confirm missing-module failures before implementation.
- [x] Implement scripts/chatgpt-connect.mjs with parser, restricted proxy and connector lifecycle. Use `spawn(..., {shell:false})`, retain existing CLI authentication, and open only the configured HTTPS web origin after health succeeds.
- [x] Add `chatgpt:connect` and `test:chatgpt-connect` npm scripts. Run Node tests and fix failures.

### Task 2: Web integration
- [x] Replace forwarded-port tests in ChatgptConnectionPanel.test.tsx with fixed-port/no-input assertions, keeping local mode and unsaved navigation coverage.
- [x] Run the panel suite and confirm old manual-port UI fails the new assertions.
- [x] Read shared JSON config in ChatgptConnectionPanel.tsx, submit loopbackPort=18080 for hosted mode and replace the field with connector instructions.
- [x] Update docs/chatgpt-connection.md with installation/login, the one command, fixed port, shutdown, conflicts and private-use scope.

### Task 3: Verify
- [x] Run Node and frontend tests; build web using the existing separate production/dev output directories. API behavior is unchanged.
- [x] Request independent review and address substantive findings.
- [x] Start the connector using the existing Northflank login with browser auto-open disabled, verify local readiness, then shut it down and confirm the port is released. Do not perform OAuth consent or replace the existing connection.
- [x] Keep the existing local dev server running with hot reload and report exact results and the production deployment requirement.

## Verification results

- 12 Node connector tests passed. Frontend: 142 tests passed; production build passed with existing lint warnings outside this change.
- Independent code review approved proxy scope, Host/cookie handling, parser, process lifecycle and Docker packaging.
- Live Northflank forwarding used the existing CLI login with browser auto-open disabled. `127.0.0.1:18080/health` returned 200 and ready=true. A deliberately invalid OAuth ticket returned the expected 409 CHATGPT_RECONNECT_REQUIRED from production, confirming route forwarding without performing consent or changing credentials.
- Stopping the connector released the port; the next request failed with ECONNREFUSED as expected. The smoke connector is stopped, and the user can run the documented command when needed.
- The fixed-port UI has not been deployed. Existing personal ChatGPT connection was preserved.
