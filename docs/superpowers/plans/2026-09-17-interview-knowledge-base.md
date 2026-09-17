# Interview Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **For the owner:** You implement **one Task at a time**, then ask for a review of that Task only. Do not start the next Task until review passes. Spec: `docs/superpowers/specs/2026-09-17-interview-knowledge-base-design.md`.

**Goal:** Ship a private interview knowledge base: Markdown notes, topics/tags, ABCD multiple-choice questions, Google OAuth whitelist, and OpenAI/DeepSeek actions — running locally on Docker Compose.

**Architecture:** npm workspaces monorepo. Next.js (`apps/web`, :3000) is the UI. NestJS (`apps/api`, :4000) owns REST, Google OAuth + JWT cookie, Prisma/PostgreSQL, and all LLM calls. Shared DTOs live in `packages/shared`. The browser calls the API with `credentials: 'include'`; Next is not a BFF.

**Tech Stack:** Next.js 15 (App Router, React 19), NestJS 10, Prisma 6, PostgreSQL 16, Passport Google + JWT cookie, Jest + Supertest (api), Vitest + Testing Library (web).

---

## File map

| Path | Responsibility |
|---|---|
| `package.json` | npm workspaces root scripts |
| `.env.example` | documented env vars (no secrets) |
| `docker-compose.yml` | `db` now; `api` + `web` in Task 17 |
| `packages/shared/src/index.ts` | DTOs, error codes, slugify, admin-email check |
| `apps/api/src/main.ts` | listen :4000, CORS, cookies, ValidationPipe |
| `apps/api/src/common/app-error.ts` | `AppError` + filter → `{ error: { code, message } }` |
| `apps/api/src/prisma/` | PrismaService |
| `apps/api/prisma/schema.prisma` | Topic, Tag, Note, NoteTag, Question |
| `apps/api/src/auth/` | Google OAuth, JWT cookie, whitelist, guard |
| `apps/api/src/topics/` | Topic CRUD + 409 rules |
| `apps/api/src/tags/` | Tag CRUD + 409 if still attached |
| `apps/api/src/notes/` | Note CRUD, FTS, tag replace |
| `apps/api/src/questions/` | ABCD CRUD on a note |
| `apps/api/src/ai/` | OpenAI-compatible client, three actions |
| `apps/web/src/lib/api.ts` | `fetch` wrapper with credentials |
| `apps/web/src/app/login/page.tsx` | Google login |
| `apps/web/src/app/page.tsx` | note list |
| `apps/web/src/app/topics/page.tsx` | topic tree |
| `apps/web/src/app/notes/[id]/page.tsx` | editor + ABCD + AI panel |
| `apps/web/src/components/` | `NoteEditor`, `QuestionForm`, `AiPanel`, `EmptyState` |

Cookie name (all tasks): `kb_access_token`.  
JWT payload: `{ sub: email, email }`, expires `7d`.  
Error body: `{ "error": { "code": "AI_TIMEOUT", "message": "..." } }`.

---

### Task 1: Repo skeleton

**Files:**
- Create: `package.json`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `apps/api/package.json` (placeholder scripts; Nest files in Task 3)
- Create: `apps/web/package.json` (placeholder; Next files in Task 10)

- [ ] **Step 1: Extend `.gitignore`**

Replace `.gitignore` with:

```
.superpowers/
node_modules/
dist/
.next/
coverage/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 2: Write root workspace files**

`package.json`:

```json
{
  "name": "interview-knowledge-base",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "test": "npm run test -w api && npm run test -w web",
    "dev:api": "npm run start:dev -w api",
    "dev:web": "npm run dev -w web"
  }
}
```

`.env.example`:

```
WEB_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
DATABASE_URL=postgresql://kb:kb@localhost:5432/kb?schema=public
ADMIN_EMAILS=you@example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
JWT_SECRET=change-me-to-a-long-random-string
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

`packages/shared/package.json`:

```json
{
  "name": "@kb/shared",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

`packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

`packages/shared/src/index.ts`:

```ts
export type CorrectChoice = 'A' | 'B' | 'C' | 'D';
export type QuestionSource = 'manual' | 'ai';
export type AiProvider = 'openai' | 'deepseek';
export type AiAction = 'summarize' | 'expand' | 'generate-questions';

export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  AI_UPSTREAM: 'AI_UPSTREAM',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ApiErrorBody = {
  error: { code: ErrorCode | string; message: string };
};

export function isAdminEmail(email: string, allowList: string): boolean {
  const needle = email.trim().toLowerCase();
  return allowList
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(needle);
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'item';
}

export type CreateQuestionBody = {
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  correctChoice: CorrectChoice;
  explanationMarkdown?: string | null;
};

export function isValidMcq(input: {
  prompt?: unknown;
  choiceA?: unknown;
  choiceB?: unknown;
  choiceC?: unknown;
  choiceD?: unknown;
  correctChoice?: unknown;
}): input is CreateQuestionBody {
  const letters: CorrectChoice[] = ['A', 'B', 'C', 'D'];
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  return (
    nonEmpty(input.prompt) &&
    nonEmpty(input.choiceA) &&
    nonEmpty(input.choiceB) &&
    nonEmpty(input.choiceC) &&
    nonEmpty(input.choiceD) &&
    letters.includes(input.correctChoice as CorrectChoice)
  );
}
```

`apps/api/package.json` (minimal so workspace exists; real deps in Task 3):

```json
{
  "name": "api",
  "private": true,
  "scripts": { "test": "echo \"no api tests yet\" && exit 0" }
}
```

`apps/web/package.json`:

```json
{
  "name": "web",
  "private": true,
  "scripts": { "test": "echo \"no web tests yet\" && exit 0" }
}
```

- [ ] **Step 3: Install and verify**

Run: `npm install`  
Expected: lockfile created; workspaces linked; no error.

Run: `node -e "const s=require('./packages/shared/src/index.ts')"`  
Do **not** expect this to work (TS). Instead:

Create `packages/shared/src/index.spec.ts` is later — for this task only confirm files exist:

Run: `ls packages/shared/src/index.ts apps/api/package.json apps/web/package.json`  
Expected: those three paths printed.

- [ ] **Step 4: Commit**

```bash
git add -f package.json .gitignore .env.example packages/shared apps/api/package.json apps/web/package.json package-lock.json
git commit -m "chore: scaffold npm workspaces and shared types"
```

**Stop. Ask for review of Task 1.**

---

### Task 2: Docker Compose + Postgres

**Files:**
- Create: `docker-compose.yml`
- Create: `apps/api/prisma/schema.prisma` (generator + datasource only)
- Test: none (infra). Verify with `pg_isready`.

- [ ] **Step 1: Write Compose and empty Prisma schema**

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: kb
      POSTGRES_PASSWORD: kb
      POSTGRES_DB: kb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kb -d kb"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

`apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Copy `.env.example` to `.env` and set `DATABASE_URL=postgresql://kb:kb@localhost:5432/kb?schema=public`.

- [ ] **Step 2: Start db and verify health**

Run: `docker compose up db -d`  
Expected: container started.

Run: `docker compose ps`  
Expected: `db` state `healthy` (wait ~10s and re-run if starting).

Run: `docker compose exec db pg_isready -U kb -d kb`  
Expected: `accepting connections`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml apps/api/prisma/schema.prisma
git commit -m "chore: add Postgres via Docker Compose"
```

**Stop. Ask for review of Task 2.**

---

### Task 3: NestJS bootstrap, health, error filter, CORS

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/jest.config.js`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/common/app-error.ts`
- Create: `apps/api/src/common/app-error.filter.ts`
- Test: `apps/api/src/common/app-error.filter.spec.ts`
- Test: `apps/api/src/health/health.controller.spec.ts`

- [ ] **Step 1: Add api dependencies**

Replace `apps/api/package.json` with:

```json
{
  "name": "api",
  "private": true,
  "scripts": {
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "build": "nest build",
    "test": "jest"
  },
  "dependencies": {
    "@kb/shared": "*",
    "@nestjs/common": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/core": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.7",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.9",
    "@nestjs/testing": "^10.4.15",
    "@types/cookie-parser": "^1.4.8",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.13.10",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.5",
    "typescript": "^5.7.3"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

`apps/api/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```

`apps/api/nest-cli.json`:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

`apps/api/jest.config.js`:

```js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
};
```

Run: `npm install` from repo root.  
Expected: api deps installed.

- [ ] **Step 2: Write failing tests for error filter and health**

`apps/api/src/common/app-error.ts`:

```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, ErrorCode } from '@kb/shared';

export class AppError extends HttpException {
  readonly code: ErrorCode | string;

  constructor(code: ErrorCode | string, message: string, status: HttpStatus) {
    super({ error: { code, message } }, status);
    this.code = code;
  }

  static validation(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    return new AppError(ERROR_CODES.VALIDATION, message, status);
  }

  static notFound(message = 'Not found') {
    return new AppError(ERROR_CODES.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string) {
    return new AppError(ERROR_CODES.CONFLICT, message, HttpStatus.CONFLICT);
  }

  static unauthenticated(message = 'Unauthenticated') {
    return new AppError(ERROR_CODES.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }
}
```

`apps/api/src/common/app-error.filter.spec.ts`:

```ts
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { AppError } from './app-error';
import { AppErrorFilter } from './app-error.filter';

function mockHost(json: jest.Mock) {
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status: (s: number) => ({ json }) }),
    }),
  } as unknown as ArgumentsHost;
}

describe('AppErrorFilter', () => {
  it('serializes AppError to { error: { code, message } }', () => {
    const json = jest.fn();
    const filter = new AppErrorFilter();
    filter.catch(AppError.notFound('Note not found'), mockHost(json));
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Note not found' },
    });
  });
});
```

`apps/api/src/health/health.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok', async () => {
    const mod = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    const ctrl = mod.get(HealthController);
    expect(ctrl.getHealth()).toEqual({ ok: true });
  });
});
```

Run: `npm test -w api`  
Expected: FAIL — `Cannot find module './app-error.filter'` and/or `HealthController`.

- [ ] **Step 3: Implement filter, health, main, app module**

`apps/api/src/common/app-error.filter.ts`:

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ERROR_CODES } from '@kb/shared';
import { AppError } from './app-error';

@Catch()
export class AppErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      return res.status(exception.getStatus()).json(exception.getResponse());
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : Array.isArray((raw as { message?: unknown }).message)
            ? ((raw as { message: string[] }).message).join('; ')
            : String((raw as { message?: string }).message ?? exception.message);

      const code =
        status === HttpStatus.UNAUTHORIZED
          ? ERROR_CODES.UNAUTHENTICATED
          : status === HttpStatus.FORBIDDEN
            ? ERROR_CODES.FORBIDDEN
            : status === HttpStatus.NOT_FOUND
              ? ERROR_CODES.NOT_FOUND
              : status === HttpStatus.CONFLICT
                ? ERROR_CODES.CONFLICT
                : ERROR_CODES.VALIDATION;

      return res.status(status).json({ error: { code, message } });
    }

    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'INTERNAL', message: 'Internal server error' },
    });
  }
}
```

`apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { ok: true };
  }
}
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}
```

`apps/api/src/main.ts`:

```ts
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppErrorFilter } from './common/app-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const origin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';

  app.use(cookieParser());
  app.enableCors({ origin, credentials: true });
  app.useGlobalFilters(new AppErrorFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(4000);
}

bootstrap();
```

- [ ] **Step 4: Run tests then smoke health**

Run: `npm test -w api`  
Expected: PASS (2 suites).

Run: `npm run start:dev -w api`  
Then: `curl -s http://localhost:4000/health`  
Expected: `{"ok":true}`  
Stop the process after checking.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): bootstrap Nest with health and error filter"
```

**Stop. Ask for review of Task 3.**

---

### Task 4: Prisma models + first migration

**Files:**
- Modify: `apps/api/package.json` (add prisma)
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Modify: `apps/api/src/app.module.ts` (import PrismaModule)
- Create: migration under `apps/api/prisma/migrations/` (generated)

- [ ] **Step 1: Add Prisma deps**

From repo root:

```bash
npm install @prisma/client -w api
npm install -D prisma -w api
```

Add scripts to `apps/api/package.json`:

```json
"prisma:migrate": "prisma migrate dev",
"prisma:generate": "prisma generate"
```

- [ ] **Step 2: Write full schema**

Replace `apps/api/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum CorrectChoice {
  A
  B
  C
  D
}

enum QuestionSource {
  manual
  ai
}

model Topic {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  parentId  String?
  parent    Topic?   @relation("TopicTree", fields: [parentId], references: [id])
  children  Topic[]  @relation("TopicTree")
  notes     Note[]
  createdAt DateTime @default(now())
}

model Tag {
  id        String    @id @default(uuid())
  name      String    @unique
  slug      String    @unique
  notes     NoteTag[]
  createdAt DateTime  @default(now())
}

model Note {
  id            String    @id @default(uuid())
  title         String
  bodyMarkdown  String
  topicId       String?
  topic         Topic?    @relation(fields: [topicId], references: [id])
  tags          NoteTag[]
  questions     Question[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model NoteTag {
  noteId String
  tagId  String
  note   Note @relation(fields: [noteId], references: [id], onDelete: Cascade)
  tag    Tag  @relation(fields: [tagId], references: [id])

  @@id([noteId, tagId])
}

model Question {
  id                    String         @id @default(uuid())
  noteId                String
  note                  Note           @relation(fields: [noteId], references: [id], onDelete: Cascade)
  prompt                String
  choiceA               String
  choiceB               String
  choiceC               String
  choiceD               String
  correctChoice         CorrectChoice
  explanationMarkdown   String?
  source                QuestionSource
  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt
}
```

- [ ] **Step 3: Migrate (db must be up from Task 2)**

```bash
cd apps/api && npx prisma migrate dev --name init && cd ../..
```

Expected: `apps/api/prisma/migrations/<timestamp>_init/migration.sql` created; client generated.

Then append FTS to a **new** SQL migration. Create file `apps/api/prisma/migrations/<new_ts>_note_fts/migration.sql` by running:

```bash
cd apps/api && npx prisma migrate dev --name note_fts --create-only && cd ../..
```

Replace that new `migration.sql` body with:

```sql
ALTER TABLE "Note"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("bodyMarkdown", ''))
  ) STORED;

CREATE INDEX "Note_search_vector_idx" ON "Note" USING GIN ("search_vector");
```

Then:

```bash
cd apps/api && npx prisma migrate dev && cd ../..
```

Expected: FTS migration applied. Do **not** add `search_vector` to the Prisma models; Notes search in Task 7 uses `$queryRaw`.

- [ ] **Step 4: Prisma module**

`apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Update `apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/prisma apps/api/src/app.module.ts apps/api/package.json package-lock.json
git commit -m "feat(api): add Prisma models and FTS migration"
```

**Stop. Ask for review of Task 4.**

---

### Task 5: Google OAuth + JWT cookie + whitelist

**Files:**
- Test: `packages/shared` is already the source of `isAdminEmail` — add `packages/shared/src/is-admin-email.spec.ts` run via api jest OR a tiny script. Put the unit test in `apps/api/src/auth/admin-email.spec.ts` that imports `isAdminEmail` from `@kb/shared`.
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/google.strategy.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/public.decorator.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/health/health.controller.ts` (`@Public()`)
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json` (passport, jwt)
- Test: `apps/api/src/auth/auth.controller.spec.ts`

- [ ] **Step 1: Install auth deps**

```bash
npm install @nestjs/jwt @nestjs/passport passport passport-google-oauth20 passport-jwt -w api
npm install -D @types/passport-google-oauth20 @types/passport-jwt -w api
```

- [ ] **Step 2: Write failing tests**

`apps/api/src/auth/admin-email.spec.ts`:

```ts
import { isAdminEmail } from '@kb/shared';

describe('isAdminEmail', () => {
  it('matches a listed email case-insensitively', () => {
    expect(isAdminEmail('You@Example.com', 'you@example.com, other@x.com')).toBe(true);
  });

  it('rejects unknown emails', () => {
    expect(isAdminEmail('nope@x.com', 'you@example.com')).toBe(false);
  });
});
```

`apps/api/src/auth/auth.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';

describe('AuthController.me', () => {
  it('returns email from request.user', async () => {
    const mod = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3000' } },
      ],
    }).compile();
    const ctrl = mod.get(AuthController);
    expect(ctrl.me({ user: { email: 'you@example.com' } } as never)).toEqual({
      email: 'you@example.com',
    });
  });
});
```

Run: `npm test -w api`  
Expected: FAIL on missing `AuthController`.

- [ ] **Step 3: Implement auth**

`apps/api/src/auth/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`apps/api/src/auth/jwt.strategy.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

export type JwtPayload = { sub: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.kb_access_token ?? null,
      ]),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
```

`apps/api/src/auth/google.strategy.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: 'http://localhost:4000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0]?.value;
    return { email };
  }
}
```

`apps/api/src/auth/jwt-auth.guard.ts`:

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

`apps/api/src/auth/auth.controller.ts`:

```ts
import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import { isAdminEmail } from '@kb/shared';
import { Public } from './public.decorator';
import { JwtPayload } from './jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleStart() {
    return;
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const web = this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    const email = (req.user as { email?: string } | undefined)?.email;
    const allow = this.config.get<string>('ADMIN_EMAILS') ?? '';

    if (!email || !isAdminEmail(email, allow)) {
      res.clearCookie('kb_access_token', { path: '/' });
      return res.redirect(`${web}/login?error=forbidden`);
    }

    const token = await this.jwt.signAsync({ sub: email, email } satisfies JwtPayload, {
      expiresIn: '7d',
    });

    res.cookie('kb_access_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return res.redirect(`${web}/`);
  }

  @Get('me')
  me(@Req() req: Request & { user: JwtPayload }) {
    return { email: req.user.email };
  }

  @Post('logout')
  logout(@Res() res: Response) {
    res.clearCookie('kb_access_token', { path: '/' });
    return res.status(204).send();
  }
}
```

`apps/api/src/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { GoogleStrategy } from './google.strategy';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    GoogleStrategy,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AuthModule {}
```

Mark health public — `apps/api/src/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  getHealth() {
    return { ok: true };
  }
}
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
```

Google Cloud Console: create OAuth client (Web), authorized redirect `http://localhost:4000/auth/google/callback`, put client id/secret and your email in `.env` `ADMIN_EMAILS`.

- [ ] **Step 4: Run tests**

Run: `npm test -w api`  
Expected: PASS including `isAdminEmail` and `AuthController.me`.

Manual: `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/auth/me`  
Expected: `401` (no cookie). `GET /health` still `200`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth apps/api/src/app.module.ts apps/api/src/health/health.controller.ts apps/api/package.json package-lock.json
git commit -m "feat(api): add Google OAuth, JWT cookie, and email whitelist"
```

**Stop. Ask for review of Task 5.**

---

### Task 6: Topics + Tags CRUD

**Files:**
- Create: `apps/api/src/topics/topics.service.ts`
- Create: `apps/api/src/topics/topics.controller.ts`
- Create: `apps/api/src/topics/topics.module.ts`
- Create: `apps/api/src/topics/dto.ts`
- Create: `apps/api/src/tags/tags.service.ts`
- Create: `apps/api/src/tags/tags.controller.ts`
- Create: `apps/api/src/tags/tags.module.ts`
- Create: `apps/api/src/tags/dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/topics/topics.service.spec.ts`
- Test: `apps/api/src/tags/tags.service.spec.ts`

- [ ] **Step 1: Write failing service tests (mocked Prisma)**

`apps/api/src/topics/topics.service.spec.ts`:

```ts
import { TopicsService } from './topics.service';
import { AppError } from '../common/app-error';

describe('TopicsService.delete', () => {
  it('conflicts when topic has children', async () => {
    const prisma = {
      topic: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1' }),
        count: jest
          .fn()
          .mockResolvedValueOnce(1) // children
          .mockResolvedValueOnce(0),
        delete: jest.fn(),
      },
      note: { count: jest.fn() },
    };
    const svc = new TopicsService(prisma as never);
    await expect(svc.remove('t1')).rejects.toBeInstanceOf(AppError);
    expect(prisma.topic.delete).not.toHaveBeenCalled();
  });
});
```

`apps/api/src/tags/tags.service.spec.ts`:

```ts
import { TagsService } from './tags.service';
import { AppError } from '../common/app-error';

describe('TagsService.delete', () => {
  it('conflicts when tag is attached to notes', async () => {
    const prisma = {
      tag: { findUnique: jest.fn().mockResolvedValue({ id: 'g1' }), delete: jest.fn() },
      noteTag: { count: jest.fn().mockResolvedValue(2) },
    };
    const svc = new TagsService(prisma as never);
    await expect(svc.remove('g1')).rejects.toBeInstanceOf(AppError);
    expect(prisma.tag.delete).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -w api`  
Expected: FAIL missing services.

- [ ] **Step 2: Implement topics**

`apps/api/src/topics/dto.ts`:

```ts
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateTopicDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
```

`apps/api/src/topics/topics.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { slugify } from '@kb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { CreateTopicDto, UpdateTopicDto } from './dto';

@Injectable()
export class TopicsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.topic.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    return this.require(id);
  }

  async create(dto: CreateTopicDto) {
    try {
      return await this.prisma.topic.create({
        data: { name: dto.name, slug: slugify(dto.name), parentId: dto.parentId },
      });
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async update(id: string, dto: UpdateTopicDto) {
    await this.require(id);
    try {
      return await this.prisma.topic.update({
        where: { id },
        data: {
          name: dto.name,
          slug: dto.name ? slugify(dto.name) : undefined,
          parentId: dto.parentId,
        },
      });
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async remove(id: string) {
    await this.require(id);
    const children = await this.prisma.topic.count({ where: { parentId: id } });
    if (children > 0) {
      throw AppError.conflict('Topic has child topics');
    }
    const notes = await this.prisma.note.count({ where: { topicId: id } });
    if (notes > 0) {
      throw AppError.conflict('Topic still has notes');
    }
    await this.prisma.topic.delete({ where: { id } });
  }

  private async require(id: string) {
    const row = await this.prisma.topic.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('Topic not found');
    return row;
  }

  private rethrowUnique(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw AppError.conflict('Topic slug already exists');
    }
  }
}
```

`apps/api/src/topics/topics.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TopicsService } from './topics.service';
import { CreateTopicDto, UpdateTopicDto } from './dto';

@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @Get()
  list() {
    return this.topics.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.topics.get(id);
  }

  @Post()
  create(@Body() dto: CreateTopicDto) {
    return this.topics.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.topics.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.topics.remove(id);
  }
}
```

`apps/api/src/topics/topics.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

@Module({
  controllers: [TopicsController],
  providers: [TopicsService],
  exports: [TopicsService],
})
export class TopicsModule {}
```

- [ ] **Step 3: Implement tags**

`apps/api/src/tags/dto.ts`:

```ts
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;
}
```

`apps/api/src/tags/tags.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { slugify } from '@kb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { CreateTagDto, UpdateTagDto } from './dto';

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  async get(id: string) {
    const row = await this.prisma.tag.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('Tag not found');
    return row;
  }

  async create(dto: CreateTagDto) {
    try {
      return await this.prisma.tag.create({
        data: { name: dto.name, slug: slugify(dto.name) },
      });
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async update(id: string, dto: UpdateTagDto) {
    const row = await this.prisma.tag.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('Tag not found');
    try {
      return await this.prisma.tag.update({
        where: { id },
        data: { name: dto.name, slug: dto.name ? slugify(dto.name) : undefined },
      });
    } catch (e) {
      this.rethrowUnique(e);
      throw e;
    }
  }

  async remove(id: string) {
    const row = await this.prisma.tag.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('Tag not found');
    const attached = await this.prisma.noteTag.count({ where: { tagId: id } });
    if (attached > 0) throw AppError.conflict('Tag is still attached to notes');
    await this.prisma.tag.delete({ where: { id } });
  }

  private rethrowUnique(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw AppError.conflict('Tag name or slug already exists');
    }
  }
}
```

`apps/api/src/tags/tags.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TagsService } from './tags.service';
import { CreateTagDto, UpdateTagDto } from './dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list() {
    return this.tags.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tags.get(id);
  }

  @Post()
  create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tags.remove(id);
  }
}
```

`apps/api/src/tags/tags.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
```

Add `TopicsModule` and `TagsModule` to `imports` of `AppModule`.

- [ ] **Step 4: Run tests**

Run: `npm test -w api`  
Expected: PASS, including delete-conflict tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/topics apps/api/src/tags apps/api/src/app.module.ts
git commit -m "feat(api): add topics and tags CRUD with conflict rules"
```

**Stop. Ask for review of Task 6.**

---

### Task 7: Notes CRUD, search, replace tags

**Files:**
- Create: `apps/api/src/notes/dto.ts`
- Create: `apps/api/src/notes/notes.service.ts`
- Create: `apps/api/src/notes/notes.controller.ts`
- Create: `apps/api/src/notes/notes.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/notes/notes.service.spec.ts`

- [ ] **Step 1: Write failing tests**

`apps/api/src/notes/notes.service.spec.ts`:

```ts
import { NotesService } from './notes.service';
import { AppError } from '../common/app-error';

describe('NotesService.create', () => {
  it('rejects title over 200 chars', async () => {
    const svc = new NotesService({ note: { create: jest.fn() } } as never);
    await expect(
      svc.create({ title: 'x'.repeat(201), bodyMarkdown: 'hi' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

Run: `npm test -w api`  
Expected: FAIL missing `NotesService`.

- [ ] **Step 2: Implement notes**

`apps/api/src/notes/dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(100000)
  bodyMarkdown!: string;

  @IsOptional()
  @IsUUID()
  topicId?: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  bodyMarkdown?: string;

  @IsOptional()
  @IsUUID()
  topicId?: string | null;
}

export class ListNotesQuery {
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsUUID()
  tagId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;
}

export class ReplaceTagsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  tagIds!: string[];
}
```

`apps/api/src/notes/notes.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { CreateNoteDto, ListNotesQuery, UpdateNoteDto } from './dto';

const noteInclude = {
  tags: { include: { tag: true } },
  questions: true,
  topic: true,
} as const;

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNoteDto) {
    if (dto.title.length > 200) throw AppError.validation('Title too long');
    if (dto.bodyMarkdown.length > 100000) throw AppError.validation('Body too long');
    return this.prisma.note.create({
      data: {
        title: dto.title,
        bodyMarkdown: dto.bodyMarkdown,
        topicId: dto.topicId,
      },
      include: noteInclude,
    });
  }

  async list(query: ListNotesQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    if (query.q && query.q.trim()) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Note"
        WHERE search_vector @@ plainto_tsquery('english', ${query.q.trim()})
        ORDER BY "updatedAt" DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `;
      const ids = rows.map((r) => r.id);
      const items = await this.prisma.note.findMany({
        where: { id: { in: ids } },
        include: noteInclude,
      });
      const order = new Map(ids.map((id, i) => [id, i]));
      items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return { items, page, pageSize };
    }

    const where: Prisma.NoteWhereInput = {
      topicId: query.topicId,
      tags: query.tagId ? { some: { tagId: query.tagId } } : undefined,
    };

    const items = await this.prisma.note.findMany({
      where,
      include: noteInclude,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: pageSize,
    });
    return { items, page, pageSize };
  }

  async get(id: string) {
    const row = await this.prisma.note.findUnique({
      where: { id },
      include: noteInclude,
    });
    if (!row) throw AppError.notFound('Note not found');
    return row;
  }

  async update(id: string, dto: UpdateNoteDto) {
    await this.get(id);
    return this.prisma.note.update({
      where: { id },
      data: {
        title: dto.title,
        bodyMarkdown: dto.bodyMarkdown,
        topicId: dto.topicId,
      },
      include: noteInclude,
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.note.delete({ where: { id } });
  }

  async replaceTags(id: string, tagIds: string[]) {
    await this.get(id);
    await this.prisma.$transaction([
      this.prisma.noteTag.deleteMany({ where: { noteId: id } }),
      this.prisma.noteTag.createMany({
        data: tagIds.map((tagId) => ({ noteId: id, tagId })),
      }),
    ]);
    return this.get(id);
  }
}
```

`apps/api/src/notes/notes.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CreateNoteDto, ListNotesQuery, ReplaceTagsDto, UpdateNoteDto } from './dto';

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  list(@Query() query: ListNotesQuery) {
    return this.notes.list(query);
  }

  @Post()
  create(@Body() dto: CreateNoteDto) {
    return this.notes.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.notes.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNoteDto) {
    return this.notes.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notes.remove(id);
  }

  @Put(':id/tags')
  replaceTags(@Param('id') id: string, @Body() dto: ReplaceTagsDto) {
    return this.notes.replaceTags(id, dto.tagIds);
  }
}
```

`apps/api/src/notes/notes.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
```

Import `NotesModule` in `AppModule`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -w api`  
Expected: PASS.

```bash
git add apps/api/src/notes apps/api/src/app.module.ts
git commit -m "feat(api): add notes CRUD, search, and tag replace"
```

**Stop. Ask for review of Task 7.**

---

### Task 8: Questions CRUD (ABCD)

**Files:**
- Create: `apps/api/src/questions/dto.ts`
- Create: `apps/api/src/questions/questions.service.ts`
- Create: `apps/api/src/questions/questions.controller.ts`
- Create: `apps/api/src/questions/questions.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/questions/questions.service.spec.ts`

- [ ] **Step 1: Write failing tests**

`apps/api/src/questions/questions.service.spec.ts`:

```ts
import { QuestionsService } from './questions.service';
import { AppError } from '../common/app-error';

describe('QuestionsService.create', () => {
  it('rejects invalid correctChoice', async () => {
    const svc = new QuestionsService({
      note: { findUnique: jest.fn().mockResolvedValue({ id: 'n1' }) },
      question: { create: jest.fn() },
    } as never);
    await expect(
      svc.create('n1', {
        prompt: 'Q?',
        choiceA: 'a',
        choiceB: 'b',
        choiceC: 'c',
        choiceD: 'd',
        correctChoice: 'E' as never,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

Run: `npm test -w api`  
Expected: FAIL missing service.

- [ ] **Step 2: Implement**

`apps/api/src/questions/dto.ts`:

```ts
import { CorrectChoice } from '@kb/shared';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceA!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceB!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceC!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  choiceD!: string;

  @IsEnum(['A', 'B', 'C', 'D'])
  correctChoice!: CorrectChoice;

  @IsOptional()
  @IsString()
  explanationMarkdown?: string;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  choiceA?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  choiceB?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  choiceC?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  choiceD?: string;

  @IsOptional()
  @IsEnum(['A', 'B', 'C', 'D'])
  correctChoice?: CorrectChoice;

  @IsOptional()
  @IsString()
  explanationMarkdown?: string | null;
}
```

`apps/api/src/questions/questions.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { isValidMcq } from '@kb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { CreateQuestionDto, UpdateQuestionDto } from './dto';

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(noteId: string, dto: CreateQuestionDto) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw AppError.notFound('Note not found');
    if (!isValidMcq(dto)) throw AppError.validation('Invalid ABCD question');
    return this.prisma.question.create({
      data: {
        noteId,
        prompt: dto.prompt.trim(),
        choiceA: dto.choiceA.trim(),
        choiceB: dto.choiceB.trim(),
        choiceC: dto.choiceC.trim(),
        choiceD: dto.choiceD.trim(),
        correctChoice: dto.correctChoice,
        explanationMarkdown: dto.explanationMarkdown,
        source: 'manual',
      },
    });
  }

  async update(id: string, dto: UpdateQuestionDto) {
    const row = await this.prisma.question.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('Question not found');
    if (Object.keys(dto).length === 0) {
      throw AppError.validation('At least one field is required');
    }
    return this.prisma.question.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const row = await this.prisma.question.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('Question not found');
    await this.prisma.question.delete({ where: { id } });
  }
}
```

`apps/api/src/questions/questions.controller.ts`:

```ts
import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto, UpdateQuestionDto } from './dto';

@Controller()
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Post('notes/:noteId/questions')
  create(@Param('noteId') noteId: string, @Body() dto: CreateQuestionDto) {
    return this.questions.create(noteId, dto);
  }

  @Patch('questions/:id')
  update(@Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questions.update(id, dto);
  }

  @Delete('questions/:id')
  remove(@Param('id') id: string) {
    return this.questions.remove(id);
  }
}
```

`apps/api/src/questions/questions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
```

Import `QuestionsModule` in `AppModule`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -w api`  
Expected: PASS.

```bash
git add apps/api/src/questions apps/api/src/app.module.ts
git commit -m "feat(api): add ABCD question CRUD"
```

**Stop. Ask for review of Task 8.**

---

### Task 9: AI module (OpenAI + DeepSeek)

**Files:**
- Create: `apps/api/src/ai/llm.client.ts`
- Create: `apps/api/src/ai/ai.service.ts`
- Create: `apps/api/src/ai/ai.controller.ts`
- Create: `apps/api/src/ai/ai.module.ts`
- Create: `apps/api/src/ai/dto.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/ai/ai.service.spec.ts`
- Test: `apps/api/src/ai/llm.client.spec.ts`

- [ ] **Step 1: Write failing tests**

`apps/api/src/ai/llm.client.spec.ts`:

```ts
import { providerConfig } from './llm.client';

describe('providerConfig', () => {
  const env = {
    OPENAI_API_KEY: 'sk-o',
    OPENAI_BASE_URL: 'https://api.openai.com/v1',
    OPENAI_MODEL: 'gpt-4o-mini',
    DEEPSEEK_API_KEY: 'sk-d',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
    DEEPSEEK_MODEL: 'deepseek-chat',
  };

  it('maps openai', () => {
    const c = providerConfig('openai', env);
    expect(c.baseUrl).toContain('openai.com');
    expect(c.apiKey).toBe('sk-o');
  });

  it('maps deepseek', () => {
    const c = providerConfig('deepseek', env);
    expect(c.baseUrl).toContain('deepseek.com');
    expect(c.apiKey).toBe('sk-d');
  });
});
```

`apps/api/src/ai/ai.service.spec.ts`:

```ts
import { AiService } from './ai.service';
import { ERROR_CODES } from '@kb/shared';
import { AppError } from '../common/app-error';

describe('AiService', () => {
  const note = {
    id: 'n1',
    title: 'TCP',
    bodyMarkdown: 'TCP is reliable',
  };

  it('summarize does not update the note', async () => {
    const prisma = {
      note: { findUnique: jest.fn().mockResolvedValue(note), update: jest.fn() },
      question: { createMany: jest.fn(), findMany: jest.fn() },
    };
    const llm = { complete: jest.fn().mockResolvedValue('short summary') };
    const svc = new AiService(prisma as never, llm as never, {
      get: (k: string) => (k.includes('KEY') ? 'sk' : k.includes('URL') ? 'http://x' : 'm'),
    } as never);
    const result = await svc.run('n1', { action: 'summarize', provider: 'openai' });
    expect(result).toEqual({ markdown: 'short summary' });
    expect(prisma.note.update).not.toHaveBeenCalled();
  });

  it('drops invalid generated MCQs', async () => {
    const prisma = {
      note: { findUnique: jest.fn().mockResolvedValue(note) },
      question: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const llm = {
      complete: jest.fn().mockResolvedValue(
        JSON.stringify([
          {
            prompt: 'Q1',
            choiceA: 'a',
            choiceB: 'b',
            choiceC: 'c',
            choiceD: 'd',
            correctChoice: 'A',
          },
          { prompt: 'bad', correctChoice: 'Z' },
        ]),
      ),
    };
    const svc = new AiService(prisma as never, llm as never, {
      get: () => 'x',
    } as never);
    await svc.run('n1', { action: 'generate-questions', provider: 'openai' });
    expect(prisma.question.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ prompt: 'Q1', source: 'ai', correctChoice: 'A' }),
      ],
    });
  });

  it('throws AI_NOT_CONFIGURED when key missing', async () => {
    const prisma = { note: { findUnique: jest.fn().mockResolvedValue(note) } };
    const svc = new AiService(prisma as never, { complete: jest.fn() } as never, {
      get: () => '',
    } as never);
    await expect(
      svc.run('n1', { action: 'summarize', provider: 'openai' }),
    ).rejects.toMatchObject({ code: ERROR_CODES.AI_NOT_CONFIGURED });
  });
});
```

Run: `npm test -w api`  
Expected: FAIL missing modules.

- [ ] **Step 2: Implement LLM client and service**

`apps/api/src/ai/dto.ts`:

```ts
import { AiAction, AiProvider } from '@kb/shared';
import { IsIn } from 'class-validator';

export class RunAiDto {
  @IsIn(['summarize', 'expand', 'generate-questions'])
  action!: AiAction;

  @IsIn(['openai', 'deepseek'])
  provider!: AiProvider;
}
```

`apps/api/src/ai/llm.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AiProvider, ERROR_CODES } from '@kb/shared';
import { AppError } from '../common/app-error';

export type ProviderEnv = Record<string, string | undefined>;

export function providerConfig(provider: AiProvider, env: ProviderEnv) {
  if (provider === 'openai') {
    return {
      apiKey: env.OPENAI_API_KEY ?? '',
      baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
    };
  }
  return {
    apiKey: env.DEEPSEEK_API_KEY ?? '',
    baseUrl: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
  };
}

@Injectable()
export class LlmClient {
  async complete(opts: {
    provider: AiProvider;
    env: ProviderEnv;
    system: string;
    user: string;
  }): Promise<string> {
    const cfg = providerConfig(opts.provider, opts.env);
    if (!cfg.apiKey) {
      throw new AppError(ERROR_CODES.AI_NOT_CONFIGURED, 'API key missing for provider', 503);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);

    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
          temperature: 0.3,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw new AppError(ERROR_CODES.AI_UPSTREAM, 'Provider error', 502);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return json.choices?.[0]?.message?.content ?? '';
    } catch (e) {
      if (e instanceof AppError) throw e;
      if ((e as { name?: string }).name === 'AbortError') {
        throw new AppError(ERROR_CODES.AI_TIMEOUT, 'AI request timed out', 504);
      }
      throw new AppError(ERROR_CODES.AI_UPSTREAM, 'Provider error', 502);
    } finally {
      clearTimeout(timer);
    }
  }
}
```

`apps/api/src/ai/ai.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CorrectChoice, isValidMcq } from '@kb/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { LlmClient } from './llm.client';
import { RunAiDto } from './dto';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmClient,
    private readonly config: ConfigService,
  ) {}

  async run(noteId: string, dto: RunAiDto) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw AppError.notFound('Note not found');

    const env = {
      OPENAI_API_KEY: this.config.get<string>('OPENAI_API_KEY'),
      OPENAI_BASE_URL: this.config.get<string>('OPENAI_BASE_URL'),
      OPENAI_MODEL: this.config.get<string>('OPENAI_MODEL'),
      DEEPSEEK_API_KEY: this.config.get<string>('DEEPSEEK_API_KEY'),
      DEEPSEEK_BASE_URL: this.config.get<string>('DEEPSEEK_BASE_URL'),
      DEEPSEEK_MODEL: this.config.get<string>('DEEPSEEK_MODEL'),
    };

    const body = `Title: ${note.title}\n\n${note.bodyMarkdown}`;

    if (dto.action === 'summarize' || dto.action === 'expand') {
      const system =
        dto.action === 'summarize'
          ? 'Summarize the note in Markdown. Do not invent facts.'
          : 'Expand the note in Markdown with more interview-relevant detail. Do not invent APIs.';
      const markdown = await this.llm.complete({
        provider: dto.provider,
        env,
        system,
        user: body,
      });
      return { markdown };
    }

    const raw = await this.llm.complete({
      provider: dto.provider,
      env,
      system:
        'Return ONLY a JSON array of multiple-choice items. Each item: prompt, choiceA, choiceB, choiceC, choiceD, correctChoice (A|B|C|D), explanationMarkdown. Exactly one correctChoice.',
      user: body,
    });

    let parsed: unknown = [];
    try {
      parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, '').trim());
    } catch {
      parsed = [];
    }
    const list = Array.isArray(parsed) ? parsed : [];
    const valid = list.filter(isValidMcq).slice(0, 8);

    if (valid.length) {
      await this.prisma.question.createMany({
        data: valid.map((q) => ({
          noteId,
          prompt: q.prompt.trim(),
          choiceA: q.choiceA.trim(),
          choiceB: q.choiceB.trim(),
          choiceC: q.choiceC.trim(),
          choiceD: q.choiceD.trim(),
          correctChoice: q.correctChoice as CorrectChoice,
          explanationMarkdown: q.explanationMarkdown ?? null,
          source: 'ai' as const,
        })),
      });
    }

    return this.prisma.question.findMany({
      where: { noteId, source: 'ai' },
      orderBy: { createdAt: 'desc' },
      take: valid.length,
    });
  }
}
```

`apps/api/src/ai/ai.controller.ts`:

```ts
import { Body, Controller, Param, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { RunAiDto } from './dto';

@Controller('notes')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post(':id/ai')
  run(@Param('id') id: string, @Body() dto: RunAiDto) {
    return this.ai.run(id, dto);
  }
}
```

`apps/api/src/ai/ai.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { LlmClient } from './llm.client';

@Module({
  controllers: [AiController],
  providers: [AiService, LlmClient],
})
export class AiModule {}
```

Import `AiModule` in `AppModule`. Nest registers `POST /notes/:id/ai` on `AiController` and `GET /notes/:id` on `NotesController`. Static path segment `ai` does not collide with UUID `id`.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -w api`  
Expected: PASS. `summarize` must not call `note.update`. Invalid MCQ dropped.

```bash
git add apps/api/src/ai apps/api/src/app.module.ts
git commit -m "feat(api): add OpenAI/DeepSeek note AI actions"
```

**Stop. Ask for review of Task 9.**

---

### Task 10: Next.js shell + auth gate

**Files:**
- Replace: `apps/web/package.json`
- Create: Next app files under `apps/web/`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/auth.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/page.tsx` (placeholder list gated)
- Create: `apps/web/vitest.config.ts`
- Test: `apps/web/src/components/EmptyState.test.tsx` (component exists; used later)

You may scaffold with:

```bash
npx create-next-app@15 apps/web-tmp --typescript --app --src-dir --no-tailwind --eslint --import-alias "@/*" --use-npm
```

Then move files into `apps/web` **or** write the files below by hand (preferred so the workspace name stays `web`).

- [ ] **Step 1: Web package.json and config**

`apps/web/package.json`:

```json
{
  "name": "web",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start --port 3000",
    "test": "vitest run"
  },
  "dependencies": {
    "@kb/shared": "*",
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-markdown": "^10.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.2.0",
    "@types/node": "^22.13.10",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^26.0.0",
    "typescript": "^5.7.3",
    "vitest": "^3.0.8"
  }
}
```

`apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "src", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};
export default nextConfig;
```

`apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom' },
});
```

Run: `npm install` from root.

- [ ] **Step 2: API helper + pages**

`apps/web/src/lib/api.ts`:

```ts
import { ApiErrorBody } from '@kb/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json()) as T | ApiErrorBody;
  if (!res.ok) {
    const err = data as ApiErrorBody;
    throw new ApiError(res.status, err.error?.code ?? 'ERROR', err.error?.message ?? res.statusText);
  }
  return data as T;
}
```

`apps/web/src/lib/auth.ts`:

```ts
import { api, ApiError } from './api';

export async function getMe(): Promise<{ email: string } | null> {
  try {
    return await api<{ email: string }>('/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
```

`apps/web/src/app/globals.css`:

```css
body { font-family: system-ui, sans-serif; margin: 0; color: #111; }
main { max-width: 960px; margin: 0 auto; padding: 24px; }
a { color: inherit; }
button, input, textarea, select { font: inherit; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.error { color: #b00020; }
.banner { background: #fdecea; padding: 8px 12px; border-radius: 8px; }
```

`apps/web/src/app/layout.tsx`:

```tsx
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/src/app/login/page.tsx`:

```tsx
'use client';

import { API_URL } from '@/lib/api';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginInner() {
  const params = useSearchParams();
  const forbidden = params.get('error') === 'forbidden';
  return (
    <main>
      <h1>Đăng nhập</h1>
      {forbidden && <p className="error">Email Google không nằm trong whitelist.</p>}
      <a href={`${API_URL}/auth/google`}>
        <button type="button">Đăng nhập bằng Google</button>
      </a>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
```

`apps/web/src/components/AuthGate.tsx`:

```tsx
'use client';

import { getMe } from '@/lib/auth';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getMe().then((me) => {
      if (!me) router.replace('/login');
      else setEmail(me.email);
      setReady(true);
    });
  }, [router]);

  if (!ready || !email) return <main>Đang tải…</main>;

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      <header className="row" style={{ padding: 16, borderBottom: '1px solid #ddd' }}>
        <a href="/">Ghi chú</a>
        <a href="/topics">Chủ đề</a>
        <span style={{ marginLeft: 'auto' }}>{email}</span>
        <button type="button" onClick={logout}>Đăng xuất</button>
      </header>
      {children}
    </>
  );
}
```

`apps/web/src/app/page.tsx`:

```tsx
import { AuthGate } from '@/components/AuthGate';

export default function HomePage() {
  return (
    <AuthGate>
      <main>
        <h1>Ghi chú</h1>
        <p>Danh sách sẽ có ở bước 11.</p>
      </main>
    </AuthGate>
  );
}
```

- [ ] **Step 3: Run web**

Run: `npm run dev -w web`  
Open `http://localhost:3000/login`. Click Google (api must be running, `.env` filled). Allowed email lands on `/`. Other email: `/login?error=forbidden`. Logout returns to login.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Next.js shell, Google login, and auth gate"
```

**Stop. Ask for review of Task 10.**

---

### Task 11: Topics page + note list

**Files:**
- Create: `apps/web/src/components/EmptyState.tsx`
- Create: `apps/web/src/app/topics/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/src/components/EmptyState.test.tsx`

- [ ] **Step 1: Write failing EmptyState test**

`apps/web/src/components/EmptyState.tsx`:

```tsx
export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div>
      <p>{message}</p>
      <button type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
```

`apps/web/src/components/EmptyState.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

test('shows CTA', () => {
  render(
    <EmptyState message="Chưa có ghi chú" actionLabel="Tạo ghi chú" onAction={() => {}} />,
  );
  expect(screen.getByText('Chưa có ghi chú')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Tạo ghi chú' })).toBeTruthy();
});
```

Run: `npm test -w web`  
Expected: PASS after files exist (write component first if FAIL cannot find module).

- [ ] **Step 2: Topics page**

`apps/web/src/app/topics/page.tsx`:

```tsx
'use client';

import { AuthGate } from '@/components/AuthGate';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

type Topic = { id: string; name: string; slug: string; parentId: string | null };

function TopicsInner() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setTopics(await api<Topic[]>('/topics'));
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    setError('');
    try {
      await api('/topics', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main>
      <h1>Chủ đề</h1>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên chủ đề" />
        <button type="button" onClick={create}>Tạo</button>
      </div>
      {error && <p className="error">{error}</p>}
      {topics.length === 0 ? (
        <EmptyState message="Chưa có chủ đề" actionLabel="Tạo chủ đề" onAction={create} />
      ) : (
        <ul>
          {topics.map((t) => (
            <li key={t.id}>{t.name}</li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function TopicsPage() {
  return (
    <AuthGate>
      <TopicsInner />
    </AuthGate>
  );
}
```

- [ ] **Step 3: Note list**

Replace `apps/web/src/app/page.tsx` with a client list:

```tsx
'use client';

import { AuthGate } from '@/components/AuthGate';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Note = { id: string; title: string };
type Topic = { id: string; name: string };
type Tag = { id: string; name: string };

function NoteList() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [topicId, setTopicId] = useState('');
  const [tagId, setTagId] = useState('');
  const [items, setItems] = useState<Note[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  async function load() {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (topicId) params.set('topicId', topicId);
    if (tagId) params.set('tagId', tagId);
    const qs = params.toString() ? `?${params}` : '';
    const data = await api<{ items: Note[] }>(`/notes${qs}`);
    setItems(data.items);
  }

  useEffect(() => {
    api<Topic[]>('/topics').then(setTopics);
    api<Tag[]>('/tags').then(setTags);
    load();
  }, []);

  return (
    <main>
      <div className="row">
        <h1>Ghi chú</h1>
        <button type="button" onClick={() => router.push('/notes/new')}>
          Tạo ghi chú
        </button>
      </div>
      <div className="row">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm" />
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">Tất cả chủ đề</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
          <option value="">Tất cả tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button type="button" onClick={load}>Tìm</button>
      </div>
      {items.length === 0 ? (
        <EmptyState
          message="Chưa có ghi chú"
          actionLabel="Tạo ghi chú"
          onAction={() => router.push('/notes/new')}
        />
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.id}>
              <a href={`/notes/${n.id}`}>{n.title}</a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <NoteList />
    </AuthGate>
  );
}
```

- [ ] **Step 4: Test and commit**

Run: `npm test -w web`  
Expected: EmptyState test PASS.

```bash
git add apps/web
git commit -m "feat(web): add Vietnamese topic and note list pages"
```

**Stop. Ask for review of Task 11.**

---

### Task 12: Note editor (Markdown + Save)

**Files:**
- Create: `apps/web/src/components/NoteEditor.tsx`
- Create: `apps/web/src/app/notes/new/page.tsx`
- Create: `apps/web/src/app/notes/[id]/page.tsx`
- Test: `apps/web/src/components/NoteEditor.test.tsx`

- [ ] **Step 1: Failing editor test**

`apps/web/src/components/NoteEditor.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { NoteEditor } from './NoteEditor';

test('Save button is present', () => {
  render(
    <NoteEditor
      title="T"
      bodyMarkdown="# hi"
      onTitleChange={() => {}}
      onBodyChange={() => {}}
      onSave={() => {}}
      error=""
    />,
  );
  expect(screen.getByRole('button', { name: 'Lưu' })).toBeTruthy();
});
```

- [ ] **Step 2: Implement editor and pages**

`apps/web/src/components/NoteEditor.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';

export function NoteEditor(props: {
  title: string;
  bodyMarkdown: string;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onSave: () => void;
  error: string;
}) {
  return (
    <div>
      <label>
        Tiêu đề
        <input value={props.title} onChange={(e) => props.onTitleChange(e.target.value)} />
      </label>
      {props.error && <p className="error">{props.error}</p>}
      <div className="row" style={{ alignItems: 'stretch' }}>
        <textarea
          style={{ flex: 1, minHeight: 240 }}
          value={props.bodyMarkdown}
          onChange={(e) => props.onBodyChange(e.target.value)}
        />
        <div style={{ flex: 1, border: '1px solid #ddd', padding: 8 }}>
          <ReactMarkdown>{props.bodyMarkdown}</ReactMarkdown>
        </div>
      </div>
      <button type="button" onClick={props.onSave}>
        Lưu
      </button>
    </div>
  );
}
```

`apps/web/src/app/notes/new/page.tsx`:

```tsx
'use client';

import { AuthGate } from '@/components/AuthGate';
import { NoteEditor } from '@/components/NoteEditor';
import { api, ApiError } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function NewNote() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      const note = await api<{ id: string }>('/notes', {
        method: 'POST',
        body: JSON.stringify({ title, bodyMarkdown: body }),
      });
      router.replace(`/notes/${note.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
    }
  }

  return (
    <main>
      <h1>Ghi chú mới</h1>
      <NoteEditor
        title={title}
        bodyMarkdown={body}
        onTitleChange={setTitle}
        onBodyChange={setBody}
        onSave={save}
        error={error}
      />
    </main>
  );
}

export default function NewNotePage() {
  return (
    <AuthGate>
      <NewNote />
    </AuthGate>
  );
}
```

`apps/web/src/app/notes/[id]/page.tsx` (editor only; questions/AI in later tasks):

```tsx
'use client';

import { AuthGate } from '@/components/AuthGate';
import { NoteEditor } from '@/components/NoteEditor';
import { api, ApiError } from '@/lib/api';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

function EditNote() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ title: string; bodyMarkdown: string }>(`/notes/${id}`).then((n) => {
      setTitle(n.title);
      setBody(n.bodyMarkdown);
    });
  }, [id]);

  async function save() {
    setError('');
    try {
      await api(`/notes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, bodyMarkdown: body }),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
    }
  }

  return (
    <main>
      <h1>Sửa ghi chú</h1>
      <NoteEditor
        title={title}
        bodyMarkdown={body}
        onTitleChange={setTitle}
        onBodyChange={setBody}
        onSave={save}
        error={error}
      />
    </main>
  );
}

export default function NotePage() {
  return (
    <AuthGate>
      <EditNote />
    </AuthGate>
  );
}
```

- [ ] **Step 3: Test and commit**

Run: `npm test -w web`  
Expected: NoteEditor Save test PASS.

```bash
git add apps/web
git commit -m "feat(web): add markdown note editor with explicit save"
```

**Stop. Ask for review of Task 12.**

---

### Task 13: ABCD question UI

**Files:**
- Create: `apps/web/src/components/QuestionForm.tsx`
- Modify: `apps/web/src/app/notes/[id]/page.tsx`
- Test: `apps/web/src/components/QuestionForm.test.tsx`

- [ ] **Step 1: Test radio for correct letter**

`apps/web/src/components/QuestionForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QuestionForm } from './QuestionForm';

test('has A-D radios', () => {
  render(
    <QuestionForm
      value={{
        prompt: '',
        choiceA: '',
        choiceB: '',
        choiceC: '',
        choiceD: '',
        correctChoice: 'A',
        explanationMarkdown: '',
      }}
      onChange={() => {}}
      onSubmit={() => {}}
    />,
  );
  expect(screen.getByLabelText('A')).toBeTruthy();
  expect(screen.getByLabelText('D')).toBeTruthy();
});
```

- [ ] **Step 2: QuestionForm + list on note page**

`apps/web/src/components/QuestionForm.tsx`:

```tsx
import { CorrectChoice, CreateQuestionBody } from '@kb/shared';

const letters: CorrectChoice[] = ['A', 'B', 'C', 'D'];

export function QuestionForm(props: {
  value: CreateQuestionBody;
  onChange: (v: CreateQuestionBody) => void;
  onSubmit: () => void;
}) {
  const v = props.value;
  function set<K extends keyof CreateQuestionBody>(key: K, val: CreateQuestionBody[K]) {
    props.onChange({ ...v, [key]: val });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <textarea
        placeholder="Câu hỏi"
        value={v.prompt}
        onChange={(e) => set('prompt', e.target.value)}
      />
      {letters.map((L) => (
        <div key={L} className="row">
          <label>
            <input
              type="radio"
              name="correct"
              checked={v.correctChoice === L}
              onChange={() => set('correctChoice', L)}
            />
            {L}
          </label>
          <input
            aria-label={L}
            value={v[`choice${L}` as const]}
            onChange={(e) => set(`choice${L}` as const, e.target.value)}
          />
        </div>
      ))}
      <textarea
        placeholder="Giải thích (tuỳ chọn)"
        value={v.explanationMarkdown ?? ''}
        onChange={(e) => set('explanationMarkdown', e.target.value)}
      />
      <button type="submit">Thêm câu hỏi</button>
    </form>
  );
}
```

Replace `apps/web/src/app/notes/[id]/page.tsx` entirely:

```tsx
'use client';

import { AuthGate } from '@/components/AuthGate';
import { EmptyState } from '@/components/EmptyState';
import { NoteEditor } from '@/components/NoteEditor';
import { QuestionForm } from '@/components/QuestionForm';
import { api, ApiError } from '@/lib/api';
import { CreateQuestionBody } from '@kb/shared';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Question = CreateQuestionBody & { id: string; correctChoice: 'A' | 'B' | 'C' | 'D' };

const emptyForm: CreateQuestionBody = {
  prompt: '',
  choiceA: '',
  choiceB: '',
  choiceC: '',
  choiceD: '',
  correctChoice: 'A',
  explanationMarkdown: '',
};

function EditNote() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [form, setForm] = useState<CreateQuestionBody>(emptyForm);

  async function load() {
    const n = await api<{ title: string; bodyMarkdown: string; questions: Question[] }>(
      `/notes/${id}`,
    );
    setTitle(n.title);
    setBody(n.bodyMarkdown);
    setQuestions(n.questions);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function save() {
    setError('');
    try {
      await api(`/notes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, bodyMarkdown: body }),
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không lưu được');
    }
  }

  async function addQuestion() {
    await api(`/notes/${id}/questions`, {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setForm(emptyForm);
    await load();
  }

  async function removeQuestion(qid: string) {
    await api(`/questions/${qid}`, { method: 'DELETE' });
    await load();
  }

  return (
    <main>
      <h1>Sửa ghi chú</h1>
      <NoteEditor
        title={title}
        bodyMarkdown={body}
        onTitleChange={setTitle}
        onBodyChange={setBody}
        onSave={save}
        error={error}
      />
      <h2>Câu hỏi ABCD</h2>
      {questions.length === 0 ? (
        <EmptyState message="Chưa có câu hỏi" actionLabel="Thêm câu hỏi" onAction={() => {}} />
      ) : (
        <ul>
          {questions.map((q) => (
            <li key={q.id}>
              {q.prompt} — đúng: {q.correctChoice}{' '}
              <button type="button" onClick={() => removeQuestion(q.id)}>
                Xoá
              </button>
            </li>
          ))}
        </ul>
      )}
      <QuestionForm value={form} onChange={setForm} onSubmit={addQuestion} />
    </main>
  );
}

export default function NotePage() {
  return (
    <AuthGate>
      <EditNote />
    </AuthGate>
  );
}
```

- [ ] **Step 3: Test and commit**

Run: `npm test -w web`  
Expected: QuestionForm radios PASS.

```bash
git add apps/web
git commit -m "feat(web): add ABCD question authoring on notes"
```

**Stop. Ask for review of Task 13.**

---

### Task 14: AI panel

**Files:**
- Create: `apps/web/src/components/AiPanel.tsx`
- Modify: `apps/web/src/app/notes/[id]/page.tsx`
- Test: `apps/web/src/components/AiPanel.test.tsx`

- [ ] **Step 1: Banner + Retry test**

`apps/web/src/components/AiPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { AiPanel } from './AiPanel';

test('shows retry on error', () => {
  render(
    <AiPanel
      error="AI request timed out"
      preview=""
      provider="openai"
      lastAction="summarize"
      onProviderChange={() => {}}
      onRun={() => {}}
      onApply={() => {}}
      onDiscard={() => {}}
    />,
  );
  expect(screen.getByText('AI request timed out')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
});
```

- [ ] **Step 2: Implement AiPanel and wire the note page**

`apps/web/src/components/AiPanel.tsx`:

```tsx
import { AiAction, AiProvider } from '@kb/shared';

export function AiPanel(props: {
  provider: AiProvider;
  lastAction: AiAction;
  onProviderChange: (p: AiProvider) => void;
  preview: string;
  error: string;
  onRun: (action: AiAction) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <section>
      <h2>AI</h2>
      <select
        value={props.provider}
        onChange={(e) => props.onProviderChange(e.target.value as AiProvider)}
      >
        <option value="openai">OpenAI</option>
        <option value="deepseek">DeepSeek</option>
      </select>
      <div className="row">
        <button type="button" onClick={() => props.onRun('summarize')}>Tóm tắt</button>
        <button type="button" onClick={() => props.onRun('expand')}>Mở rộng</button>
        <button type="button" onClick={() => props.onRun('generate-questions')}>Sinh câu hỏi</button>
      </div>
      {props.error && (
        <div className="banner">
          <span>{props.error}</span>
          <button type="button" onClick={() => props.onRun(props.lastAction)}>
            Thử lại
          </button>
        </div>
      )}
      {props.preview && (
        <div>
          <pre>{props.preview}</pre>
          <button type="button" onClick={props.onApply}>Áp dụng</button>
          <button type="button" onClick={props.onDiscard}>Huỷ</button>
        </div>
      )}
    </section>
  );
}
```

In `apps/web/src/app/notes/[id]/page.tsx`, import `AiPanel`, `AiAction`, `AiProvider`. Add state:

```tsx
const [provider, setProvider] = useState<AiProvider>('openai');
const [lastAction, setLastAction] = useState<AiAction>('summarize');
const [preview, setPreview] = useState('');
const [aiError, setAiError] = useState('');
```

Add these functions next to `save`:

```tsx
async function runAi(action: AiAction) {
  setLastAction(action);
  setAiError('');
  try {
    const result = await api<{ markdown?: string }>(`/notes/${id}/ai`, {
      method: 'POST',
      body: JSON.stringify({ action, provider }),
    });
    if (action === 'generate-questions') {
      setPreview('');
      await load();
      return;
    }
    setPreview(result.markdown ?? '');
  } catch (e) {
    setAiError(e instanceof ApiError ? e.message : 'AI lỗi');
  }
}

async function applyPreview() {
  await api(`/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ bodyMarkdown: preview }),
  });
  setBody(preview);
  setPreview('');
}
```

Render `<AiPanel>` after the question form:

```tsx
<AiPanel
  provider={provider}
  lastAction={lastAction}
  onProviderChange={setProvider}
  preview={preview}
  error={aiError}
  onRun={runAi}
  onApply={applyPreview}
  onDiscard={() => setPreview('')}
/>
```

- [ ] **Step 3: Test and commit**

Run: `npm test -w web`  
Expected: AiPanel retry PASS.

```bash
git add apps/web
git commit -m "feat(web): add AI panel with preview apply/discard and retry"
```

**Stop. Ask for review of Task 14.**

---

### Task 15: API e2e tests (supertest)

**Files:**
- Create: `apps/api/test/jest-e2e.json`
- Create: `apps/api/test/app.e2e-spec.ts`
- Modify: `apps/api/package.json` (`test:e2e`)

Requires: `db` up, `.env` `DATABASE_URL` + `JWT_SECRET`. Google is **not** called; mint a JWT in the test.

- [ ] **Step 1: e2e config**

`apps/api/test/jest-e2e.json`:

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.ts$": "ts-jest" },
  "testEnvironment": "node"
}
```

In `apps/api/package.json` set:

```json
"test": "jest && jest --config ./test/jest-e2e.json",
"test:e2e": "jest --config ./test/jest-e2e.json"
```

- [ ] **Step 2: Write e2e spec**

`apps/api/test/app.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AppErrorFilter } from '../src/common/app-error.filter';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

describe('API e2e', () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new AppErrorFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(() => app.close());

  function auth() {
    const token = jwt.sign({ sub: 'you@example.com', email: 'you@example.com' });
    return request(app.getHttpServer()).get('/auth/me').set('Cookie', `kb_access_token=${token}`);
  }

  it('401 without cookie', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('me with cookie', async () => {
    const res = await auth().expect(200);
    expect(res.body.email).toBe('you@example.com');
  });

  it('note CRUD + ABCD validation + 404', async () => {
    const token = jwt.sign({ sub: 'you@example.com', email: 'you@example.com' });
    const cookie = `kb_access_token=${token}`;
    const http = request(app.getHttpServer());

    const created = await http
      .post('/notes')
      .set('Cookie', cookie)
      .send({ title: 'TCP', bodyMarkdown: 'reliable' })
      .expect(201);
    const id = created.body.id;

    await http.get(`/notes/${id}`).set('Cookie', cookie).expect(200);

    await http
      .post(`/notes/${id}/questions`)
      .set('Cookie', cookie)
      .send({
        prompt: 'Q',
        choiceA: 'a',
        choiceB: 'b',
        choiceC: 'c',
        choiceD: 'd',
        correctChoice: 'E',
      })
      .expect(400);

    await http.get('/notes/00000000-0000-0000-0000-000000000000').set('Cookie', cookie).expect(404);

    await http.delete(`/notes/${id}`).set('Cookie', cookie).expect(200);
  });

  it('409 duplicate topic slug', async () => {
    const token = jwt.sign({ sub: 'you@example.com', email: 'you@example.com' });
    const cookie = `kb_access_token=${token}`;
    const http = request(app.getHttpServer());
    await http.post('/topics').set('Cookie', cookie).send({ name: 'UniqueTopicX' }).expect(201);
    await http.post('/topics').set('Cookie', cookie).send({ name: 'UniqueTopicX' }).expect(409);
  });
});
```

Nest default POST status may be **201** or **200**. If create returns 200, change `.expect(201)` to `.expect(200)` after the first run.

AI timeout: unit-tested in Task 9 via abort; do not call real providers in e2e.

- [ ] **Step 3: Run and commit**

Run: `npm test -w api`  
Expected: unit + e2e PASS (db running).

```bash
git add apps/api/test apps/api/package.json
git commit -m "test(api): add supertest coverage for auth, notes, ABCD, conflicts"
```

**Stop. Ask for review of Task 15.**

---

### Task 16: Web component tests complete

**Files:**
- Already created: `EmptyState.test.tsx`, `NoteEditor.test.tsx`, `QuestionForm.test.tsx`, `AiPanel.test.tsx`
- If any are missing from earlier tasks, add them in this task with the exact code from Tasks 11–14.

- [ ] **Step 1: Run the full web suite**

Run: `npm test -w web`  
Expected: all four tests PASS.

- [ ] **Step 2: Commit only if you added missing tests**

```bash
git add apps/web/src/components/*.test.tsx
git commit -m "test(web): cover editor, empty state, questions, and AI retry"
```

If nothing to commit, skip.

**Stop. Ask for review of Task 16.**

---

### Task 17: Compose whole stack + smoke

**Files:**
- Modify: `docker-compose.yml` (add `api` and `web`)
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`

- [ ] **Step 1: Dockerfiles**

`apps/api/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install
WORKDIR /repo/apps/api
RUN npx prisma generate
CMD ["npx", "nest", "start"]
```

`apps/web/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm install
WORKDIR /repo/apps/web
CMD ["npx", "next", "dev", "--port", "3000", "--hostname", "0.0.0.0"]
```

Replace `docker-compose.yml` with:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: kb
      POSTGRES_PASSWORD: kb
      POSTGRES_DB: kb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kb -d kb"]
      interval: 5s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    env_file: .env
    environment:
      DATABASE_URL: postgresql://kb:kb@db:5432/kb?schema=public
    ports:
      - "4000:4000"
    depends_on:
      db:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    env_file: .env
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
    ports:
      - "3000:3000"
    depends_on:
      - api

volumes:
  pgdata:
```

Google callback stays `http://localhost:4000/auth/google/callback` (browser talks to published ports).

On api container start, run migrations once:

```bash
docker compose exec api npx prisma migrate deploy
```

(or add to api CMD: `npx prisma migrate deploy && npx nest start`). Prefer updating api `CMD`:

```
CMD ["sh", "-c", "npx prisma migrate deploy && npx nest start"]
```

- [ ] **Step 2: Smoke**

```bash
docker compose up --build
```

Expected: `http://localhost:4000/health` → `{"ok":true}`; `http://localhost:3000/login` loads.

Manual smoke (you):

1. Login with whitelisted Google email.
2. Create a topic and a note.
3. Add an ABCD question.
4. If an API key is set, run Summarize and confirm the note is unchanged until Áp dụng.

Run: `npm test` from root.  
Expected: api + web tests PASS.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml apps/api/Dockerfile apps/web/Dockerfile
git commit -m "chore: run web, api, and postgres with Docker Compose"
```

**Stop. v1 checklist complete after this review.**

---

## Self-review vs spec

| Spec item | Task |
|---|---|
| Monorepo Next + Nest + Postgres | 1–2, 10, 17 |
| Google OAuth, JWT cookie, ADMIN_EMAILS | 5, 10 |
| No users table | 4–5 |
| Topic/Tag/Note/NoteTag/Question ABCD | 4, 6–8, 13 |
| FTS search | 4 migration + 7 |
| 409 delete rules | 6 |
| AI summarize/expand no write; generate ABCD | 9, 14 |
| OpenAI + DeepSeek, 30s, 503/502/504 | 9 |
| Error shape | 3 |
| Vietnamese UI, Save not autosave | 11–12 |
| Component + API tests | 3, 5–9, 11–16 |
| Compose local, not cloud | 2, 17 |
| Portfolio / mock / multi-user | not in this plan |

Cookie name is `kb_access_token` everywhere. JSON question fields are `choiceA`…`correctChoice`. Prisma fields are `choiceA`…`correctChoice` (Prisma client camelCase).
