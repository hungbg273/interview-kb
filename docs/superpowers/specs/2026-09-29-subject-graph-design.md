# Subject graph — Design Spec

Date: 2026-09-29  
Status: approved  
Parent spec: `docs/superpowers/specs/2026-09-17-interview-knowledge-base-design.md`

This spec **replaces** v1 topic-as-single-parent-tree, note-as-single-topic, and tags. Auth, notes body, ABCD questions, and AI stay as in the parent spec.

## 1. Purpose

The owner browses interview notes on a **directed graph of subjects** (DAG): expand from roots, hover a node to act, assign each note to zero or more subjects. Search finds subject names or note titles.

## 2. Goals and non-goals

### Goals

- A note belongs to **0, 1, or many** subjects.
- A subject has **0, 1, or many** parents (DAG). Roots have no parents.
- Home `/` is the explorer: graph of **subjects only**; notes live in a side panel for the **selected** node.
- Default graph shows **roots only** plus a virtual **Chưa gán chủ đề** node. Click a node to expand/collapse **direct children** and to select it.
- Hover a node: menu — select/view notes, add child subject, attach existing note, add parent.
- Clicking a subject shows notes attached to **that subject only** (not descendants). To see TCP notes, select TCP.
- Search returns **two sections**: matching subjects and matching notes (title). Click a subject to select it on the graph; click a note to open the editor.
- Assign subjects from the **graph** and from the **note editor** (chips, 0..N).
- Create / add parent / delete subjects **on the explorer**. Remove the dedicated `/topics` page.
- Remove **tags** (UI, API, tables).

### Non-goals

- Notes as graph nodes.
- Showing descendant notes when a parent is selected.
- Autosave, WYSIWYG, public portfolio, mock-quiz loop (still later phases).
- Infinite canvas of the full DAG on first load.

## 3. Information model

```text
topic            id, name, slug, created_at
topic_parent     parent_id → topic, child_id → topic
                 UNIQUE (parent_id, child_id)
                 CHECK parent_id <> child_id
note             id, title, body_markdown, timestamps   (no topic_id)
note_topic       note_id → note, topic_id → topic
                 UNIQUE (note_id, topic_id)
```

Drop: `topic.parent_id`, `note.topic_id`, `tag`, `note_tag`.

**Identity:** one `topic` row for “TCP”. Two parents = two `topic_parent` rows. Editing the name updates every incoming path.

**Virtual folder:** **Chưa gán chủ đề** is not stored. It is the set of notes with no `note_topic` rows. Selecting it lists those notes. It has no parents, no children, and cannot gain parents. Creating a note while it is selected creates a note with empty `topicIds`.

**Cycles:** adding parent P to child C is forbidden if it would create a directed cycle (including P = C). API returns **409** `CYCLE`.

## 4. UI

Language: Vietnamese chrome (same as parent spec). Visual language: existing board tokens (light `#e8edf2`, accent `#1f6f8b`).

### 4.1 Home `/` — graph explorer

- Top: search field, placeholder `Tìm chủ đề hoặc tiêu đề ghi chú`.
- Left/main: directed graph. Nodes = subjects + virtual uncategorized. Edges = `topic_parent` (parent → child).
- Initial: root topics (no rows as child in `topic_parent`) + **Chưa gán chủ đề**.
- **Click** a real subject: toggle expand of **direct** children; set selection; load that node’s notes in the panel.
- **Hover** a real subject: action menu (Chọn / xem ghi chú, Thêm chủ đề con, Gắn ghi chú, Thêm cha). Uncategorized: only select / tạo ghi chú / (no add parent, no add child).
- Right panel: title of selected node, note list for **exact** assignment, actions **Tạo ghi chú** (pre-fill `topicIds` when a real subject is selected) and **Gắn ghi chú có sẵn** (picker).
- If TCP has two parents and both parents are expanded, TCP appears **once** with two incoming edges.

### 4.2 Search

Typing in the search field (non-empty) shows an overlay with two blocks:

1. **Chủ đề** — name contains the query (case-insensitive). Click → select that node on the graph, expand ancestors so it is visible, close overlay.
2. **Ghi chú** — title contains the query. Click → `/notes/:id`.

If both match, **both** blocks are shown. Empty block is omitted or shows a short empty line, not a mixed flat list.

Search does **not** match note body. Matching a subject name does **not** list that subject’s notes in the overlay; the owner clicks the subject first.

### 4.3 Note editor `/notes/:id` and `/notes/new`

Keep the three-column board. Add subject chips under the title. Chip add/remove on the editor is **local until Lưu** (same payload as title/body, including `topicIds`). New note: chips optional; first save sends `topicIds` (default `[]`).

Graph **Gắn ghi chú** calls `PUT /notes/:id/topics` **immediately** and **adds** the selected subject to the existing set (does not wipe other subjects).

### 4.4 Routing

| Path | Role |
|---|---|
| `/` | Graph explorer (replaces the flat note list as the primary browse) |
| `/notes/new`, `/notes/:id` | Editor + questions + AI (unchanged except subject chips) |
| `/topics` | Remove. Redirect `/topics` → `/`. Drop the topbar “Chủ đề” link. |

## 5. API

All routes remain JWT-cookie protected except existing public auth routes.

| Action | HTTP |
|---|---|
| List roots | `GET /topics` — topics that are not a child in `topic_parent` |
| List direct children | `GET /topics?parentId=:id` |
| Get one | `GET /topics/:id` — include `parentIds`, `childIds` |
| Create | `POST /topics` `{ name, parentIds?: string[] }` |
| Rename | `PATCH /topics/:id` `{ name }` |
| Add parent | `POST /topics/:id/parents` `{ parentId }` |
| Remove parent | `DELETE /topics/:id/parents/:parentId` |
| Delete topic | `DELETE /topics/:id` — see §6 |
| Notes on one subject | `GET /notes?topicId=:id` — exact `note_topic` only |
| Uncategorized notes | `GET /notes?uncategorized=1` |
| Search overlay | `GET /search?q=` `{ topics: { id, name }[], notes: { id, title }[] }` |
| Replace subjects on a note | `PUT /notes/:id/topics` `{ topicIds: string[] }` |
| Create note | `POST /notes` may include `topicIds: string[]` (default `[]`) |

Remove tag endpoints and `tagId` note filters.

`GET /notes?q=` may remain for title search used by the overlay’s notes block; `/search` is the single overlay contract so the web does not stitch two calls. `q` still does not search body for this feature.

## 6. Delete and detach

**Delete subject `T`:**

1. Delete all `note_topic` rows for `T` (notes themselves stay).
2. Delete all `topic_parent` rows where `parent_id = T` or `child_id = T`.
3. Former children that have **no remaining parents** become roots.
4. Delete `T`.

No 409 for “still has notes” or “still has children”.

**Delete note:** remove `note_topic` rows with the note (existing cascade/FK).

**Remove parent edge only:** `DELETE /topics/:id/parents/:parentId` does not delete the child topic.

## 7. Errors

Same envelope as parent spec: `{ error: { code, message } }`.

| HTTP | code | When |
|---|---|---|
| 400 | VALIDATION | empty name, empty search `q` if required, unknown id in `topicIds` / `parentIds` batch |
| 404 | NOT_FOUND | unknown topic or note |
| 409 | CYCLE | new parent edge would cycle or is self-parent |
| 409 | CONFLICT | duplicate topic slug; duplicate parent edge |

Adding a parent that already exists → 409 CONFLICT. Adding a parent that cycles → 409 CYCLE (not CONFLICT).

## 8. Migration

1. Create `topic_parent` and `note_topic`.
2. Backfill `topic_parent` from current `topic.parent_id` where not null.
3. Backfill `note_topic` from current `note.topic_id` where not null.
4. Drop `topic.parent_id`, `note.topic_id`, `note_tag`, `tag`.

## 9. Testing

**API unit:** cycle detector (A→B, refuse B→A; refuse self); `GET /notes?topicId` does not return descendant-only notes; delete topic detaches notes and orphans children to roots.

**API e2e:** note with two subjects; search two sections; uncategorized; delete parent subject leaves child as root if it had no other parent.

**Web:** expand-on-click shows children; hover menu present; search overlay two sections; editor chips; `/topics` redirects.

No Playwright in this spec (parent spec still excludes browser e2e).

## 10. Decisions

| Decision | Choice |
|---|---|
| Parent cardinality | 0..N (DAG), not a single `parent_id` tree |
| Note cardinality | 0..N subjects |
| Browse notes | Exact node only |
| Graph nodes | Subjects (+ virtual uncategorized); notes in panel |
| Expand | Roots first; click expands direct children |
| Search | Two sections; subject name + note title; not body |
| Tags | Removed |
| Topic CRUD UI | Explorer only |
| Delete topic | Detach notes; drop edges; children keep other parents or become roots |
| Cycles | Forbidden, 409 CYCLE |
