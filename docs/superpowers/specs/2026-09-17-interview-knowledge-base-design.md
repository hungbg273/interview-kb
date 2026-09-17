# Interview Knowledge Base — Design Spec

Date: 2026-09-17  
Status: draft, pending user review  
Product name (working): Interview Knowledge Base

## 1. Purpose

A personal web app to **systematize interview knowledge**. The owner (admin) writes Markdown notes, organizes them with topics/tags, attaches Q&A, and uses AI (OpenAI or DeepSeek) to summarize, expand, or generate questions.

This is also a **fullstack practice project** for a backend engineer: React/Next.js, NestJS API design, PostgreSQL, Docker Compose, then later CI/CD and a public portfolio.

**Primary user in v1:** only the owner, signed in with Google.

**Secondary user (later, out of v1):** interviewers viewing a portfolio.

## 2. Goals and non-goals

### v1 goals

- Private knowledge base: topics (optional tree), tags, Markdown notes, Q&A attached to notes.
- Google OAuth; only emails in `ADMIN_EMAILS` can use the app.
- AI actions on a note: summarize, expand, generate questions.
- Local run via Docker Compose (web + api + postgres).
- Automated tests for API (unit + API e2e) and a few web components.

### Explicitly out of v1

- Public portfolio.
- Practice / mock interview loop (sessions, grading, spaced repetition). Q&A records exist so that phase can attach later.
- Multi-user, roles, or `users` table.
- Cloud deploy and GitHub Actions.
- Browser e2e (Playwright/Cypress).
- AI job queue / Redis.
- Autosave, rich WYSIWYG, real-time collab.
- Logging every AI prompt/response in the database.

### Later phases (not this spec’s implementation)

1. **Practice/mock** — quiz from `Question`, AI feedback.
2. **Portfolio** — public read-only site for interviewers.
3. **Cloud + CI/CD** — GitHub Actions, host FE/BE/DB.
4. **Multi-user** — add `users` / `roles` and `owner_id` on notes.

## 3. Architecture

**Style:** modular monolith, one monorepo.

```
personal_project/
  apps/web              Next.js (React) UI
  apps/api              NestJS REST API, auth, AI
  packages/shared       shared TypeScript DTOs / API types
  docker-compose.yml    web, api, postgres
  docs/                 this spec and later plans
```

**Runtime:** Browser loads Next.js `:3000`. The browser calls NestJS `:4000` with `credentials: 'include'`. NestJS reads/writes PostgreSQL `:5432` and is the only process that calls OpenAI or DeepSeek. API keys stay in api env, never in the browser.

**Package manager:** npm workspaces (root `package.json` with `apps/*` and `packages/*`).

**ORM:** Prisma on `apps/api`, schema in `apps/api/prisma/schema.prisma`. Migrations committed in git.

**Why this split:** Next.js is for learning frontend. NestJS keeps HTTP, auth, and domain logic in a familiar backend. Shared types reduce drift. One compose file is enough system-design practice before cloud.

## 4. Auth

NestJS owns Google OAuth (Passport Google strategy) and JWT.

1. User clicks Login on Next → browser navigates to `GET {API}/auth/google`.
2. Google redirects to `GET {API}/auth/google/callback`.
3. If profile email is **not** in `ADMIN_EMAILS` (comma-separated env) → **403**, no cookie, redirect Next `/login?error=forbidden`.
4. If allowed → set **httpOnly** JWT cookie (`Path=/`, `SameSite=Lax`, `Secure` only when `NODE_ENV=production`), redirect Next `/`.
5. Next.js client calls API with `credentials: 'include'` (`CORS` origin `http://localhost:3000`, `credentials: true`).
6. `GET {API}/auth/me` returns `{ email }` or 401.
7. `POST {API}/auth/logout` clears the cookie.

No `users` table. JWT payload: `{ sub: email, email }`, expiry 7 days. All routes except `/auth/google`, `/auth/google/callback` require a valid JWT.

Cookie is scoped to the API origin (`localhost:4000`). That is intentional: the SPA talks to the API directly; Next does not proxy as a BFF.

## 5. Data model

PostgreSQL. No `user_id` columns in v1.

### Topic

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text not null | |
| slug | text unique not null | |
| parent_id | uuid null FK → Topic | optional tree; null = root |
| created_at | timestamptz | |

Deleting a topic with children is **rejected (409)** until children are moved or deleted. Notes under a deleted topic get `topic_id = null` only if we add an explicit “detach” path; default v1: **cannot delete topic that still has notes** (409).

### Tag

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text unique not null | |
| slug | text unique not null | |
| created_at | timestamptz | |

### Note

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text not null | max 200 chars |
| body_markdown | text not null | max 100_000 chars |
| topic_id | uuid null FK → Topic | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### NoteTag

| Column | Type | Notes |
|---|---|---|
| note_id | uuid FK → Note | composite PK |
| tag_id | uuid FK → Tag | composite PK |

Deleting a note removes NoteTag rows (cascade). Deleting a tag **blocked** if still attached to notes (409), unless we detach first.

### Question

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| note_id | uuid not null FK → Note ON DELETE CASCADE | |
| prompt | text not null | the question |
| answer_markdown | text not null | |
| extra_notes | text null | |
| source | enum `manual` \| `ai` | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Search: PostgreSQL full-text on `Note.title` and `Note.body_markdown` (`tsvector` generated column + GIN index). Query param `q` on note list.

## 6. NestJS modules

Each module has one job and talks through its service, not another module’s internals.

| Module | Responsibility | Depends on |
|---|---|---|
| Auth | Google OAuth, JWT cookie, `ADMIN_EMAILS` | config |
| Topics | CRUD + tree parent rules | Prisma |
| Tags | CRUD + attach rules | Prisma |
| Notes | CRUD, list filters, search, tag attach | Prisma, Topics, Tags |
| Questions | CRUD scoped to a note | Prisma, Notes |
| Ai | provider client, three actions | Notes, Questions, config |

`packages/shared` holds request/response types used by both api DTO classes (or mapped from them) and the Next client.

## 7. HTTP API (v1)

Base URL: `http://localhost:4000`. JSON. Authenticated unless noted.

**Auth**

- `GET /auth/google` — unauthenticated, redirect
- `GET /auth/google/callback` — unauthenticated, redirect
- `GET /auth/me`
- `POST /auth/logout`

**Topics:** `GET/POST /topics`, `GET/PATCH/DELETE /topics/:id`

**Tags:** `GET/POST /tags`, `GET/PATCH/DELETE /tags/:id`

**Notes**

- `GET /notes?topicId&tagId&q&page&pageSize` — pageSize default 20, max 50
- `POST /notes`
- `GET /notes/:id` — includes tags and questions
- `PATCH /notes/:id`
- `DELETE /notes/:id`
- `PUT /notes/:id/tags` — body `{ tagIds: uuid[] }` replaces the set

**Questions**

- `POST /notes/:noteId/questions`
- `PATCH /questions/:id`
- `DELETE /questions/:id`

**AI**

- `POST /notes/:id/ai` body `{ "action": "summarize" | "expand" | "generate-questions", "provider": "openai" | "deepseek" }`

Semantics:

- `summarize` / `expand`: return `{ markdown }`. **Do not write** the note. The UI shows a preview; user copies or clicks Apply (Apply is `PATCH /notes/:id` with that markdown).
- `generate-questions`: model returns a JSON list of `{ prompt, answer_markdown }`; API inserts `Question` rows with `source=ai`. Return the created rows. Cap **8** questions per call (truncate extras).

Timeout: **30 seconds** per LLM call. No streaming in v1.

## 8. AI providers

Env on api:

- `OPENAI_API_KEY`, `OPENAI_BASE_URL` (default `https://api.openai.com/v1`), `OPENAI_MODEL`
- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com/v1`), `DEEPSEEK_MODEL`

One HTTP client (OpenAI-compatible chat completions). `provider` picks key, base URL, and model. If the chosen provider’s key is missing → `AI_NOT_CONFIGURED` (503).

Prompts are server-side templates: include note title + body; for generate-questions ask for strict JSON only.

## 9. Frontend (apps/web)

Next.js App Router. UI language: **Vietnamese**. Note/Q&A content is whatever the owner types (typically English for interview prep).

**Routes**

| Path | Auth | Screen |
|---|---|---|
| `/login` | public | Google login + forbidden/error query |
| `/` | required | note list: search, filter topic/tag, create |
| `/topics` | required | topic list/tree CRUD |
| `/notes/new` | required | editor |
| `/notes/:id` | required | editor + Q&A + AI panel |

Unauthenticated access to protected routes → `/login`.

**Note editor (v1):** split pane, textarea Markdown + preview. Explicit **Save** button (no autosave). AI panel: choose provider, buttons Summarize / Expand / Generate questions. Summarize/expand result in a preview with Apply or Discard. Generate questions appends to the Q&A list. Empty states have a CTA (create topic / create note).

**Markdown:** `react-markdown` for preview. No file upload / images hosting in v1 (pasted `![alt](url)` is fine if the URL is external).

## 10. Error handling

Unified body:

```json
{ "error": { "code": "AI_TIMEOUT", "message": "..." } }
```

| HTTP | code | When |
|---|---|---|
| 401 | UNAUTHENTICATED | missing/expired JWT → web redirects to `/login` |
| 403 | FORBIDDEN | Google email not in whitelist |
| 400 | VALIDATION | DTO fail (empty title, body too long) |
| 404 | NOT_FOUND | unknown note/topic/tag/question |
| 409 | CONFLICT | duplicate slug/name; delete blocked by children/notes |
| 502 | AI_UPSTREAM | provider 4xx/5xx after mapping |
| 504 | AI_TIMEOUT | exceeded 30s |
| 503 | AI_NOT_CONFIGURED | missing key for selected provider |

Messages never include API keys or raw provider payloads. Validation errors include field names for forms. AI failures do not mutate the note. UI: field errors under inputs; AI errors as a banner + Retry; no silent failures.

## 11. Testing

**api**

- Unit (Prisma mocked): provider URL/key mapping; summarize/expand do not persist; generate-questions inserts rows with `source=ai`.
- API e2e (supertest + the Compose Postgres): whitelist 403 vs happy JWT path (Google OAuth mocked); note CRUD; 404; 409 slug; AI timeout mocked.

**web**

- Component tests (React Testing Library): Save-enabled editor, empty state CTA, AI banner + Retry.

**Not in v1:** Playwright, visual regression.

Local bar: `docker compose up` works; `npm test` in `apps/api` and `apps/web` passes.

## 12. Local operations

`docker-compose.yml` services: `db` (postgres:16), `api`, `web`.  
Root `.env.example` documents: `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `OPENAI_*`, `DEEPSEEK_*`, `DATABASE_URL`, `NEXT_PUBLIC_API_URL`, `WEB_ORIGIN`.

Google OAuth redirect URI for local: `http://localhost:4000/auth/google/callback`.

## 13. Learning checklist (alongside the product)

v1 (this spec)

- [ ] Monorepo + Docker Compose
- [ ] Next.js App Router, list/detail, Markdown preview
- [ ] NestJS modules, Prisma, REST
- [ ] Cookie auth + CORS
- [ ] Integrate an upstream HTTP API (LLM)

After v1

- [ ] Practice/mock on top of `Question`
- [ ] Public portfolio
- [ ] GitHub Actions, cloud deploy
- [ ] Multi-user if needed

## 14. Decisions log

| Decision | Choice | Rejected |
|---|---|---|
| v1 focus | Knowledge base | Portfolio-first; equal split |
| First slice | Knowledge base, then practice | Practice-first; thin both |
| Taxonomy | User-defined topics/tags | Fixed interview tracks |
| Users in v1 | None; JWT email only | users table “for later” |
| Stack | Next.js + NestJS + PostgreSQL | Next-only fullstack; Vite SPA |
| Architecture | Modular monolith monorepo | Next BFF; queues + two repos |
| AI | OpenAI + DeepSeek, sync | Single provider only; full agnostic gateway |
| Auth | Google OAuth + whitelist | password; env-only gate |
| Deploy v1 | Docker Compose local | Vercel/Railway; VPS |
| Note shape | Markdown + attached Q&A | Wiki-only; Q&A-only |
| AI write policy | Preview then Apply; generate-questions inserts drafts | Autowrite into note |
| Save | Explicit Save | Autosave |
