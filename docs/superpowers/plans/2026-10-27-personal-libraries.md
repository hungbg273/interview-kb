# Personal Libraries and Community Implementation Plan

**Goal:** Account-owned topics/notes, explicit snapshot publishing, community feed and independent clones.
**Approved migration:** Assign existing topics/notes/questions to the currently signed-in account using explicit LEGACY_OWNER_EMAIL; fail rather than guess when existing data lacks an owner.
**Architecture:** users UUID identities mapped to authenticated email. Fail-closed AsyncLocalStorage account scope for shared repositories and explicit owner verification in raw SQL/AI workers. DB constraints validate relation ownership. Separate publication snapshots serve the community, private drafts remain isolated. Clone copies title/body/attribution into the caller's library with an optional owned topic.
**Scope:** Existing Google allowlist remains. Only authenticated users see community publications. Clone does not copy private questions, subject trees, credentials or AI history.

- [x] Failing ownership/context and publication/clone tests; migration and real two-account integration tests.
- [x] users, ownership migration and request/worker scope; all private repository queries, raw AI/import paths and graph relations.
- [x] Publication snapshot API, owner-only publish/update/unpublish and transactional independent clones.
- [x] Community tab/feed, Markdown/Mermaid detail preview, topic selection/clone and publication controls.
- [x] Complete unit/integration checks, review, database backup and local migration/deployment, browser QA.

Validation: 131 backend tests passed with both PostgreSQL/Redis integration suites enabled (separate test databases/queues); 82 frontend tests passed. API TypeScript passes. Existing frontend TypeScript errors remain in generated new-note exports, CSS declarations and Vite type dependencies. Reviewer reported no critical/important issues.

Local rollout: backup .local-backups/pre-personal-libraries.olJTN9 (Git ignored, owner-only permissions), migration applied, counts preserved at 9 notes / 25 topics / 6 questions. All 9 existing notes belong to the confirmed account. Zero publications were created. Live browser verified authenticated Community empty state and private library availability. Cache is remounted if the authenticated account changes on focus.
