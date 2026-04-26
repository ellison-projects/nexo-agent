---
name: nexo-prm
description: Use for non-person NexoPRM data — working notes (plans/todos), areas of focus, meals, food log, home items (household chores/maintenance), stash (pocket knowledge base for non-person facts like products, places, gate codes), and projects (multi-week threads). Also handles "debrief" — a read-only roll-up of open todos across home and the current plan. Invoke for requests like "what's on my plan", "remember that I like Reach floss", "save this cafe", "debrief me", or "what are my open todos". **For person-attached data (people, moments, things-to-remember, AI reminders, connection groups, lists, address/phone/email updates), use the `nexo-people` skill instead.** **For grocery operations, use the `nexo-grocery` skill instead.** Calls the NexoPRM Agent API at app.nexoprm.com. Runs in a forked subagent — when invoking, pass the user's full intent as the argument, since this skill has no access to conversation history.
context: fork
---

# NexoPRM Agent API

## Your task

$ARGUMENTS

Fulfill the request above using the NexoPRM API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found. If the request is a read, return the data the caller needs. If it's a write, confirm it happened.

---

Personal-relationship-manager API. Every request uses a god-mode bearer token plus a per-user impersonation header. This skill covers the **non-person** subset of the API (excluding groceries). For person-attached resources (people, moments, things-to-remember, AI reminders, relationships, connection groups, lists, people reports), see the `nexo-people` skill. For grocery operations, see the `nexo-grocery` skill.

**Full API reference (source of truth):** https://app.nexoprm.com/agentapi/llm.md — fetch this if an endpoint or field shape isn't covered below, or if a call 404s / rejects unexpectedly (the API may have changed since this skill was last updated).

## Auth

Read from env:
- `NEXO_API_KEY` — bearer token
- `NEXO_USER` — email or numeric id of the user to impersonate

Required headers on most endpoints:
- `Authorization: Bearer $NEXO_API_KEY`
- `X-Nexo-User: $NEXO_USER`
- `Content-Type: application/json` on writes

Endpoints that DON'T need `X-Nexo-User`: `GET /api/agent/me`, `GET /api/agent/users`, `GET /api/agent/audit-log`.

Optional headers:
- `X-Nexo-Dry-Run: true` — validate a write without persisting (use if unsure)
- `Idempotency-Key` — reserved

Base URL: `https://app.nexoprm.com`

## Safety rules

1. **Every `DELETE` must include `?confirm=true`** or the server returns `400 validation_error`. Only delete when the user's intent is explicit.
2. **Never log or echo `NEXO_API_KEY`.**
3. Prefer `PATCH` over recreate; most updates are idempotent.
4. **CRITICAL: If any API endpoint fails (non-2xx response), STOP immediately and report the failure.** Include the endpoint, method, status code, and error response. Do NOT continue attempting other operations.
5. **When unsure, ask first.** If the content of an item is unclear or the right endpoint isn't obvious, confirm before writing.
6. **Always report back what you updated.** After every successful write, tell the user in one line what changed and on which record — include the list/note name and the id. Example: *"Added 'milk' (#3041) to groceries list #17."*
7. **For person-attached operations, defer to `nexo-people`.** If $ARGUMENTS asks you to log a moment, save a thing-to-remember, link people, update a person's contact info, or anything else person-shaped, return a note saying "this belongs in nexo-people" rather than calling those endpoints from here.
8. **For grocery operations, defer to `nexo-grocery`.** If $ARGUMENTS asks you to add/view/check off grocery items, return a note saying "this belongs in nexo-grocery" rather than calling those endpoints from here.

## Error shape

```json
{ "error": "human-readable message", "code": "error_code" }
```
Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `internal_error`, `missing_user_header`, `unknown_user`, `service_unavailable`.

## Data format

- IDs are **strings** (bigints serialized as text).
- Timestamps are ISO 8601 UTC.
- Request bodies use **snake_case** (`person_id`, `important_dates`, `pinned_at`), not camelCase.
- Omit `created_at` / `logged_at` to default to server NOW.
- "My current plan" → `/working-notes/latest`. "My groceries" → `/groceries/lists/active`. Both return 404 if none exists — create one, then retry.

## List conventions

All list endpoints accept `limit` (default 50, max 200) and `offset` (default 0).

---

## Endpoints

### Auth & meta
- `GET /api/agent/me` — verify token, resolve impersonated user. Returns `{ key, user }`.
- `GET /api/agent/users` — list all users.

### Briefing (one-shot situational awareness)
Read-only roll-up of the user's whole state. Use for open-ended prompts ("debrief me", "what's going on", "catch me up") and as grounded context before answering anything broad. Window is ~14 days forward; 7 days back for recent moments.
- `GET /api/agent/briefing` — no query params. Response top-level keys: `generated_at`, `window_days`, `user`, `pillars`, `goals`, `trigger_list`, `upcoming_important_dates`, `ai_reminders` (`{ overdue, upcoming, recently_done }`), `working_note_reminders`, `working_notes`, `things_to_remember`, `recent_moments`, `pinned_people`, `stale_people`, `pinned_lists`, `connection_groups`, `food_log`, `home_items`, `meal_plans`. Note: `grocery_items` also appears in the briefing but is handled by the `nexo-grocery` skill. Drill into dedicated endpoints only when you need more than the briefing contains.

### Snapshots (before-state capture)
Read-only. Every destructive agent write (DELETE, PATCH, PUT) creates a snapshot capturing the before-state. For deletes, cascade children are also snapshotted. Covers all resource types — including people-shaped writes performed via the `nexo-people` skill.
- `GET /api/agent/snapshots?resourceType=&resourceId=&limit=&offset=` — list snapshots. Filter by resource type or id.
- `GET /api/agent/snapshots/{id}` — retrieve full snapshot including original row data and cascade-deleted children.

### Person-attached resources

People, moments, things-to-remember, AI reminders, connection groups, lists, and people reports live in the `nexo-people` skill. If $ARGUMENTS asks for any of those, return a brief note that the request belongs there rather than calling those endpoints from here.

### Working notes (on-demand plans with items + headings; one level of nesting)
`{id}` accepts a numeric id OR the literal `latest` (404 if no notes yet). Items with no `parent_id` and `is_heading: false` are treated as **Drafts** — brain-dump zone for todos not yet organized. Headings can carry a `notes` field for long-form project context.
- `GET /api/agent/working-notes`
- `POST /api/agent/working-notes` — `{ priorities_text? }`.
- `GET /api/agent/working-notes/{id|latest}` — returns `{ working_note, items }`. Items include `notes` field.
- `PATCH /api/agent/working-notes/{id|latest}` — `{ priorities_text }`.
- `DELETE /api/agent/working-notes/{id|latest}?confirm=true`
- `POST /api/agent/working-notes/{id|latest}/items` — `{ content, parent_id?, is_heading?, notes? }`. `parent_id` must reference a heading in the same note. `sort_order` auto-assigned. `notes` optional (typically used for headings).
- `PUT /api/agent/working-notes/{id|latest}/reorder` — rewrite `sort_order` for every item. Body: `{ item_ids: [...] }` — full ordered list of every item id in the note.
- `PATCH /api/agent/working-note-items/{itemId}` — writable: `content`, `checked`, `is_heading`, `sort_order`, `parent_id`, `notes`. Send `notes: null` to clear.
- `DELETE /api/agent/working-note-items/{itemId}?confirm=true`

### Areas of focus (ongoing life themes; typically 3–5)
- `GET|POST /api/agent/areas-of-focus` — POST body `{ title, description, sort_order }`.
- `GET|PATCH|DELETE /api/agent/areas-of-focus/{id}` — PATCH writable: `title`, `description`, `sort_order`.

### Meals
- `GET|POST /api/agent/meals` — POST body `{ name, notes, link }`.
- `GET|PATCH|DELETE /api/agent/meals/{id}` — PATCH writable: `name`, `notes`, `link`.

### Food log
- `GET /api/agent/food-log?personName=&since=&until=&limit=&offset=`
- `POST /api/agent/food-log` — only `description` required. Others: `person_name` (default ""), `calories`, `logged_at` (default NOW).
- `PATCH /api/agent/food-log/{id}` — writable: `person_name`, `description`, `calories`, `logged_at`.
- `DELETE /api/agent/food-log/{id}?confirm=true`

### Stash
Pocket knowledge base for non-person facts. Products, places, gate codes, stray info worth recalling. Title + optional note + optional location + tags + optional photos.
- `GET /api/agent/stash?q=&tag=&limit=&offset=` — `q` matches title/note/location (case-insensitive). `tag` is exact-match. Ordered by `updated_at DESC`. Each row includes `photo_count`.
- `POST /api/agent/stash` — required: `title`. Optional: `note`, `location`, `tags` (string array), `photo_urls`.
- `GET /api/agent/stash/{id}` — detail with attached `photos`.
- `PATCH /api/agent/stash/{id}` — writable: `title`, `note`, `location`, `tags` (replaces full array), and/or `add_photo_urls` / `remove_photo_ids`.
- `DELETE /api/agent/stash/{id}?confirm=true` — cascades to photos.

### Home items
Household maintenance / chores ("replace smoke alarm batteries", "regrout shower"). One implicit list per user — no parent list resource. "Open" = `done_at IS NULL`.
- `GET /api/agent/home-items` — open items only by default. Pass `?done=true` to include completed. Returns `{ home_items: [...] }`; each row has `note_count`.
- `POST /api/agent/home-items` — `{ title }` required. Returns `{ home_item }`, 201.
- `GET /api/agent/home-items/{id}` — returns `{ home_item, notes }`.
- `PATCH /api/agent/home-items/{id}` — writable: `title`, `done_at` (ISO timestamp to mark done, `null` to reopen).
- `DELETE /api/agent/home-items/{id}?confirm=true` — cascades to notes.
- `POST /api/agent/home-items/{id}/notes` — `{ content }`. Returns `{ note }`, 201.
- `PATCH /api/agent/home-item-notes/{noteId}` — writable: `content`.
- `DELETE /api/agent/home-item-notes/{noteId}?confirm=true`

### Projects
Multi-week initiatives (job searches, holiday planning, training plans). Each has an editable collection of **notes**, a flat **next-actions** checklist, optional pillar tag, optional target date, freeform tags, and linked people.

**Mental model:** projects are for threads with a lifespan — opens, accumulates notes + actions over weeks/months, quietly fades. One-off events go in moments. Multi-week threads belong on projects.

Each note has a `kind` — `note` (regular observation) or `reflection` (distilled lesson). Notes are fully editable after creation. When user asks "what did I learn from X?", filter notes by `kind=reflection`.

**Per-note tags:** Each note can have its own tags for slicing long project timelines by cycle/phase. Canonical use case: perpetual projects (e.g., yearly father-son trip) where you tag each cycle's notes with the year (`2026`, `2027`) to filter without splitting projects. Tags are lowercase; tag pool is per-project. Pass `tags: string[]` on POST/PATCH (replaces full set; `[]` clears). `GET /projects/{id}` returns `note_tags` (aggregate list of all distinct tags used across all notes in this project).

- `GET /api/agent/projects?tag=&include=archived` — list. Excludes archived by default. `?tag=mothers-day` filters case-insensitive.
- `POST /api/agent/projects` — create. Required: `title`. Optional: `description`, `overview_notes`, `pillar` (`family`/`relationships`/`health`/`ambitions`), `target_date`, `tags`.
- `GET /api/agent/projects/tags` — distinct tags across non-archived projects with counts. Use for autocompletion/discovery.
- `GET /api/agent/projects/{id}` — full detail in one call — `project` (includes `note_tags` aggregate), `notes` (each with `images` and `tags`), `actions`, `linked_people`, `reminders` (open first by `due_at`, then handled).
- `PATCH /api/agent/projects/{id}` — partial update. Pin/unpin via `pinned_at` (ISO or null). Archive/unarchive via `archived_at` (ISO or null). Update `overview_notes` for big-picture context.
- `DELETE /api/agent/projects/{id}?confirm=true` — cascades to notes, actions, images, reminders.
- `POST /api/agent/projects/{id}/notes` — add note. Required: `content`. Optional: `kind` (`note` default, or `reflection`), `tags` (string array), `image_urls`, `created_at`.
- `PATCH /api/agent/projects/{id}/notes/{noteId}` — edit content/kind/tags; `add_image_urls`, `remove_image_ids`. Pass `tags: []` to clear all tags. Fully editable.
- `DELETE /api/agent/projects/{id}/notes/{noteId}?confirm=true`
- `POST /api/agent/projects/{id}/actions` — add next-action. Required: `content`. Optional: `due_date`.
- `PATCH /api/agent/projects/{id}/actions/{actionId}` — edit content/due/sort or mark done via `done_at` (ISO or null).
- `DELETE /api/agent/projects/{id}/actions/{actionId}?confirm=true`
- `POST /api/agent/projects/{id}/people` — link person. `{ "person_id": "..." }`.
- `DELETE /api/agent/projects/{id}/people/{personId}?confirm=true` — unlink.

**When to use `reflection` vs `note`:** note = "what happened" (raw observation). reflection = "the lesson" (distilled takeaway). Filter to reflections when user looks back across time.

**Tag handling (project-level):** tags stored lowercase; case-insensitive dedup. `?tag=` filter is also case-insensitive.

**Per-note tags use case:** For recurring projects (e.g., Annual Father-Son Trip), tag each year's notes with that year (`["2026"]`, `["2027"]`) so you can review just one cycle later without creating separate projects.

### Audit log (read-only)
- `GET /api/agent/audit-log?userId=&since=&action=&resourceType=&limit=&offset=` — returns `{ entries: [...] }`. Bodies stored as SHA-256 digest, not raw.

---

## Primary flows (worked end-to-end)

These flows cover the main non-person use cases. Each shows the user prompt, the curl calls, the expected response JSON, and how to branch on ambiguity or missing parent records.

---

### Flow A — Add to a working note (plan) item

**User:** "Add 'call the plumber' to my plan."

**Step 1. Try appending to the latest note.**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/working-notes/latest/items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"content":"Call the plumber"}'
```

Expected response (201):
```json
{
  "item": {
    "id": "904",
    "working_note_id": "61",
    "content": "Call the plumber",
    "parent_id": null,
    "is_heading": false,
    "checked": false,
    "sort_order": 7
  }
}
```

Report back with ids:
> "Added 'Call the plumber' (#904) to your current plan (note #61)."

**Branch: no note yet (404).** Response:
```json
{ "error": "no working notes yet", "code": "not_found" }
```

Create one, then retry:
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/working-notes" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{}'
```
Response: `{ "working_note": { "id": "61", "priorities_text": null, ... } }` (201).

Then repeat the `POST .../latest/items` call.

**Ambiguity check:** if the user says "add it under Home" — they want the item nested under a heading called "Home". Fetch the note, find the heading id, and pass it as `parent_id`:
```bash
curl -s "https://app.nexoprm.com/api/agent/working-notes/latest" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```
Response (abbreviated):
```json
{
  "working_note": { "id": "61" },
  "items": [
    { "id": "900", "content": "Home", "is_heading": true,  "parent_id": null },
    { "id": "901", "content": "Work", "is_heading": true,  "parent_id": null }
  ]
}
```
If no "Home" heading exists, ask:
> "I don't see a 'Home' heading on your current plan. Create it, or add the item at the top level?"

Otherwise POST with `parent_id: "900"`.

---

### Flow B — Debrief (todos rollup via the briefing endpoint)

**User:** "Debrief." (also: "what are my open todos?", "summary of my todos")

Single-call, read-only. The briefing endpoint already rolls up everything Debrief needs — don't recreate it from individual calls.

**Step 1. Fetch the briefing.**

```bash
curl -s "https://app.nexoprm.com/api/agent/briefing" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

**Step 2. Pick out the two todo-relevant sections.** The briefing has many more fields (pillars, goals, stale people, etc.); ignore them for Debrief. If the user follows up with something broader, reach back into the same response. Note: `grocery_items` also appears in the briefing but is handled by the `nexo-grocery` skill.

- `home_items` — open household chores.
- `working_note_reminders` — plan items flagged as due/overdue.

Trust the briefing — don't pad the output with extra calls to `/working-notes/latest` or the home endpoints. If a field looks incomplete, tell the user so they can fix the briefing server-side.

**Step 3. Render grouped, with ids so the user can check things off in a follow-up.**

> **Debrief — 7 open**
>
> **Home (3):**
> - #124 Replace smoke alarm batteries
> - #131 Regrout shower
> - #140 Hang picture in hallway
>
> **Plan reminders (4):**
> - #905 Call the plumber
> - #907 Draft Q2 plan
> - #910 Book dentist
> - #913 Email landlord

**Empty handling.**
- Any section with zero entries → omit it.
- All sections empty → "Nothing open. You're clear."

---

### Flow C — Save a non-person fact to Stash

**User:** "Remember that I like Reach floss" or "Save this cafe — they had great salads"

Stash is for durable facts not tied to a person. If the user is telling you something about a specific person ("Sarah prefers texts"), defer to the `nexo-people` skill — that's a thing-to-remember on the person, not a stash entry.

**IMPORTANT: Always confirm before creating a stash entry.** Parse the item, propose the title and notes using the template below, and wait for Matt to confirm.

**Template format:**
```
Title: {brief title like "Turkey Bites"}
Notes: {full product name if available, plus where the item can be purchased from}
```

If you don't know where the item can be purchased, ask Matt.

**Step 1. Propose the entry and wait for confirmation.**

Example:
> "I'll add this to your Stash:
>
> **Title:** Reach Mint Floss
> **Notes:** Reach Mint Floss (thin waxed kind) — available at Costco
>
> Look good?"

Wait for Matt to confirm before proceeding to step 2.

**Step 2. Create the stash entry.**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/stash" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Reach Mint Floss",
    "note": "The thin waxed kind — glides between tight teeth better than Glide.",
    "tags": ["health", "costco"]
  }'
```

Expected response (201):
```json
{
  "entry": {
    "id": "47",
    "title": "Reach Mint Floss",
    "note": "The thin waxed kind — glides between tight teeth better than Glide.",
    "location": null,
    "tags": ["health", "costco"],
    "photo_count": 0,
    "created_at": "2026-04-20T05:20:00Z",
    "updated_at": "2026-04-20T05:20:00Z"
  }
}
```

Report back with id:
> "Saved 'Reach Mint Floss' (#47) to your stash."

**With a photo (e.g. image from Telegram):**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/stash" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Corner Cafe",
    "note": "Great salads, quiet spot for working",
    "location": "Main St & 5th",
    "tags": ["restaurants", "work-friendly"],
    "photo_urls": ["https://api.telegram.org/file/bot.../photo.jpg"]
  }'
```

**Looking it up later:**
```bash
# Search by keyword
curl -s "https://app.nexoprm.com/api/agent/stash?q=floss" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"

# Filter by tag
curl -s "https://app.nexoprm.com/api/agent/stash?tag=health" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

---

### Flow D — Add a note to a project (multi-week threads)

**User:** "Note that the interview with Acme went well" or "Add a reflection on Mother's Day planning"

Multi-week threads belong on projects, not moments. Projects are for initiatives with a lifespan (job searches, holiday planning, training plans).

**Step 1. Find or create the project.**
```bash
# Search for existing project by tag
curl -s "https://app.nexoprm.com/api/agent/projects?tag=interview-prep" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

If no project exists, create one:
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/projects" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"title":"Interview prep","tags":["interview-prep"],"pillar":"ambitions"}'
```

Response (201):
```json
{
  "project": {
    "id": "42",
    "title": "Interview prep",
    "tags": ["interview-prep"],
    "pillar": "ambitions",
    "created_at": "2026-04-24T..."
  }
}
```

**Step 2. Add the note.**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/projects/42/notes" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User": $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"content":"Acme round 2 went well — they want me owning the platform roadmap.","kind":"note"}'
```

For "lessons learned" content, use `"kind": "reflection"`:
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/projects/42/notes" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"content":"Key lesson: focus on impact metrics, not just features.","kind":"reflection"}'
```

Expected response (201):
```json
{
  "note": {
    "id": "812",
    "project_id": "42",
    "content": "Acme round 2 went well...",
    "kind": "note",
    "created_at": "2026-04-24T..."
  }
}
```

**Step 3. Report back.**
> "Added note #812 to Interview prep project (#42)."

**Editing notes:** Unlike moments, project notes are editable. If user says "rework that last note to say...", use `PATCH /projects/{id}/notes/{noteId}` with new `content`.

**Reflections vs notes:**
- `note` = "what happened" (raw observation, written in the moment)
- `reflection` = "the lesson" (distilled takeaway, written mid-flight or at end)

When user asks "what did I learn from X?", filter notes by `kind=reflection`.

---

## Other common operations (quick reference)

- **Save a non-person fact:** `POST /stash` with `{ "title": "...", "note": "...", "tags": [...] }`. Use for products, places, gate codes, etc.
- **Check off a plan item:** `GET /working-notes/latest` → find item → `PATCH /working-note-items/{id}` with `{ "checked": true }`.
- **Add long-form notes to a heading:** `PATCH /working-note-items/{headingId}` with `{ "notes": "Long-form project context here..." }`.
- **Promote a heading to the top:** `GET /working-notes/latest` → reorder items array (heading + children to front) → `PUT /working-notes/latest/reorder` with `{ "item_ids": [...] }`.
- **Add a note to a project (multi-week thread):** `GET /projects?tag=<tag>` to find or `POST /projects` to create → `POST /projects/{id}/notes` with `{ "content": "...", "kind": "note" }` (or `"reflection"` for lessons learned). See Flow D.
- **Pull up reflections from a project:** `GET /projects?tag=<tag>` → `GET /projects/{id}` → filter `notes` array by `kind=reflection`.
- **Delete anything:** append `?confirm=true`. Only after explicit user intent. Example:
  ```bash
  curl -s -X DELETE "https://app.nexoprm.com/api/agent/home-items/812?confirm=true" \
    -H "Authorization: Bearer $NEXO_API_KEY" \
    -H "X-Nexo-User: $NEXO_USER"
  ```
- **Dry-run a write** (validate without persisting): add `-H "X-Nexo-Dry-Run: true"` to any POST/PATCH/DELETE.
