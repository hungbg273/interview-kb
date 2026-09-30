# Practice quiz — Design Spec

Date: 2026-09-29  
Status: approved  
Parent spec: `docs/superpowers/specs/2026-09-17-interview-knowledge-base-design.md`  
Related: `docs/superpowers/specs/2026-09-29-subject-graph-design.md`

Phase 2 of the knowledge base: a **mock quiz** over existing ABCD `Question` rows. Answers stay hidden until the owner submits the whole attempt.

## 1. Purpose

The owner practices interview questions without seeing `correctChoice` while answering. After submit they see score and a per-question review.

## 2. Decisions (locked)

- Source: **one note or one topic** (not both, not “all notes”).
- Topic filter uses **exact** `note_topic` (same rule as the graph panel: not descendants).
- Flow: **one question at a time**; score only after the last question is submitted.
- Pool: **shuffle**, then take `limit` (default 10). If fewer questions exist, return all of them shuffled.
- Entry: page **`/practice`** only (plus a topbar link). No “Luyện tập” button on the graph or editor in this slice.
- Persistence: **stateless**. No quiz/attempt table. The client holds the question list and answers until `POST /practice/grade`.
- Difficulty is **not** a quiz filter (questions do not store difficulty).

## 3. Non-goals

- Resume, history, leaderboard, timer.
- Mixing multiple topics in one request.
- Descendant-topic questions.
- Changing how `GET /notes/:id` returns questions (editor still shows the correct letter).
- Public unauthenticated quiz.

## 4. API

Auth: same JWT cookie `kb_access_token` as the rest of the app. Unauthenticated → 401.

Controller is HTTP-only. `PracticeService` owns shuffle, omit-answer mapping, and scoring. Persistence goes through `QuestionsRepository` (add list-for-practice queries there; do not use `DataSource` in the controller/service for CRUD).

### 4.1 `GET /practice/questions`

Query:

| Param | Rule |
|---|---|
| `noteId` | UUID of a note **or** omitted |
| `topicId` | UUID of a topic **or** omitted |
| `limit` | integer 1–50, default **10** |

Exactly one of `noteId` / `topicId` is required. Both or neither → **400** `VALIDATION`.

Unknown note or topic → **404** `NOT_FOUND`.

Response **200**:

```json
{
  "items": [
    {
      "id": "uuid",
      "prompt": "...",
      "choiceA": "...",
      "choiceB": "...",
      "choiceC": "...",
      "choiceD": "..."
    }
  ]
}
```

Must **not** include `correctChoice`, `explanationMarkdown`, or `source`. Empty pool → `{ "items": [] }` (not 404).

Shuffle is server-side so two requests with the same filter can return different order.

### 4.2 `POST /practice/grade`

Body:

```json
{
  "answers": [
    { "questionId": "uuid", "choice": "A" }
  ]
}
```

`choice` is `A` | `B` | `C` | `D`. Empty `answers` → **400** `VALIDATION`. Duplicate `questionId` → **400** `VALIDATION`. Unknown `questionId` → **400** `VALIDATION`.

Scoring: each row is correct iff `choice === question.correctChoice`. `total` is `answers.length`. `correct` is the number of matches.

Response **200**:

```json
{
  "total": 10,
  "correct": 7,
  "items": [
    {
      "questionId": "uuid",
      "prompt": "...",
      "choice": "B",
      "correctChoice": "A",
      "ok": false,
      "explanationMarkdown": "..."
    }
  ]
}
```

`items` follow the **same order** as `answers`. `explanationMarkdown` may be `null`.

The client is trusted to send the ids it received from GET. Cheating via other endpoints is out of scope for a private whitelist app.

## 5. Web

Language: Vietnamese chrome.

### 5.1 Setup (`/practice`)

- Select **source type**: ghi chú | chủ đề.
- Pick one note (search by title via existing `GET /search?q=` or list) **or** one topic (search subjects via `GET /search?q=`).
- Input **Số câu** (1–50, default 10).
- Button **Bắt đầu**. If GET returns no items, show empty copy: `Chưa có câu hỏi cho lựa chọn này`.

### 5.2 Taking the quiz

- Show `Câu i / n`, prompt, four choices A–D.
- **Câu tiếp** is disabled until a choice is selected.
- Last question: button **Nộp bài** instead of Câu tiếp.
- No back button in this slice (YAGNI).
- Keep chosen answers in React state; do not persist.

### 5.3 Results

- Headline: `Đúng {correct} / {total}`.
- List each item: prompt, your letter, correct letter, đúng/sai, explanation if present.
- Button **Làm đề khác** returns to setup.

### 5.4 Navigation

`AuthGate` topbar: **Ghi chú** (`/`) and **Luyện tập** (`/practice`).

## 6. Tests (agent writes after owner implements)

- Unit: omit `correctChoice` on list; grade matches; duplicate/unknown id → VALIDATION; topic uses exact note_topic only.
- Web: setup requires a source; cannot go next without a choice; results show score.

## 7. File sketch

| Path | Role |
|---|---|
| `apps/api/src/practice/` | module, thin controller, service |
| `apps/api/src/database/questions.repository.ts` | list by note / by topicId via `note_topic` |
| `apps/web/src/app/practice/page.tsx` | setup + quiz + results |
| `apps/web/src/components/AuthGate.tsx` | Luyện tập link |
