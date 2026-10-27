# AI Job Preview Modal Implementation Plan

**Goal:** Open retained job results directly in a modal from the job history, notification, or note status.
**Architecture:** A provider-owned selection renders a dedicated modal. Fetch result only for completed jobs, cancel stale reads on selection changes, preserve page state. Apply uses the existing endpoint with unsaved-change protection and refreshes saved note data.
**Tech Stack:** React, Next.js, existing API, CSS, Vitest/Testing Library.

- [x] Add failing tests for direct job click, loading/results/errors, close, and explicit apply.
- [x] Implement accessible modal and provider wiring; preserve import review continuation.
- [x] Replace inline note result handler with modal opening; refresh note after explicit apply.
- [x] Run relevant frontend tests and verify an existing job in the browser.

Validation: 66 frontend tests passed. Reviewed and fixed delayed-refresh draft overwrite and dismissal during pending apply. Existing project-wide TypeScript errors remain in CSS declarations and Vite dependency types. Browser verified retained job opens in modal without navigation.
