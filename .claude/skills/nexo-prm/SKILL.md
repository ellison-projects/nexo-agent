---
name: nexo-prm
description: Use when the user wants to read or write their personal relationship data in NexoPRM — people, moments (timestamped observations about someone), things to remember, AI reminders, relationships, lists, connection groups, linked people, working notes (plans/todos), areas of focus, meals, food log, or groceries. Invoke for requests like "log that Sarah mentioned X", "who is Alex's birthday", "add milk to my groceries", "what's on my plan", "remind me that Jamie prefers texting". Calls the NexoPRM Agent API at app.nexoprm.com.
---

# NexoPRM Agent API

Personal-relationship-manager API. Every request uses a god-mode bearer token plus a per-user impersonation header.

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
3. **Disambiguate people before writing.** When the user refers to someone by first name/nickname:
   - Search with `GET /api/agent/people?q=<name>`
   - 0 matches → ask whether to create; if yes, `POST /api/agent/people` then proceed
   - 1 match → proceed
   - 2+ matches → present candidates with distinguishing info (email/phone/relationship) and wait for the user to pick
   - Never guess a person id.
4. Prefer `PATCH` over recreate; most updates are idempotent.
5. **When unsure, ask first.** If a name is ambiguous, the content of a moment/item is unclear, or the right endpoint isn't obvious, confirm with the user before writing.
6. **Always report back what you updated.** After every successful write, tell the user in one line what changed and on which record — include the person/list/note name and the id. Example: *"Logged moment #812 on Sarah Chen (#42)."* / *"Added 'milk' (#3041) to groceries list #17."* If the write failed, say what went wrong and what you did (or didn't do).
7. **When disambiguating people, show ids.** List each candidate with its id so the user can pick unambiguously. Example: *"I have two Sams — #42 Sam Rivera (sam@example.com), #88 Sam Okafor (+1 555-0134). Which one?"*

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

### People
- `GET /api/agent/people?q=&limit=&offset=` — search by name/email/phone substring.
- `POST /api/agent/people` — only `name` required. Other fields: `email`, `phone`, `address`, `important_dates` (array of `{label, date, recurring}`), `relationship` (`{connectionType}`), `topics` (string array), `pinned_at`.
- `GET /api/agent/people/{id}` — full detail: moments, things_to_remember, linked_people, lists, connection_groups, ai_summary.
- `PATCH /api/agent/people/{id}` — writable: `name`, `email`, `phone`, `address`, `important_dates`, `reminder`, `relationship`, `topics`, `pinned_at`.
- `DELETE /api/agent/people/{id}?confirm=true` — cascades.

### Moments (timestamped observations; triggers AI reminder analysis)
- `GET /api/agent/moments?personId=&relationshipId=&since=&until=&limit=&offset=`
- `POST /api/agent/moments` — body: `{ person_id | relationship_id, content, created_at?, skip_ai_analysis? }`. Exactly one of `person_id` / `relationship_id`. Returns `{ moment, ai_analysis_queued }`, 201.
- `GET /api/agent/moments/{id}` — returns `{ moment, images, ai_reminders }`.
- `PATCH /api/agent/moments/{id}` — only `content` mutable.
- `DELETE /api/agent/moments/{id}?confirm=true`

### Things to remember (durable, non-timestamped facts)
- `GET /api/agent/things-to-remember?personId=&relationshipId=`
- `POST /api/agent/things-to-remember` — `{ person_id | relationship_id, content }`
- `GET|PATCH|DELETE /api/agent/things-to-remember/{id}` — PATCH body `{ content }`.

### AI reminders
- `GET /api/agent/ai-reminders?personId=&status=&dueBefore=&limit=&offset=` — status one of `new`, `done`, `dismissed`.
- `GET /api/agent/ai-reminders/{id}`
- `PATCH /api/agent/ai-reminders/{id}` — only `status` mutable.

### Relationships
- `GET|POST /api/agent/relationships` — POST body `{ name, notes, reminder }`.
- `GET|PATCH|DELETE /api/agent/relationships/{id}` — PATCH writable: `name`, `notes`, `reminder`.
- `POST /api/agent/relationships/{id}/members` — `{ person_id }`.
- `DELETE /api/agent/relationships/{id}/members/{personId}?confirm=true`

### Lists
- `GET|POST /api/agent/lists` — POST body `{ name, pinned_at }`.
- `GET|PATCH|DELETE /api/agent/lists/{id}` — PATCH writable: `name`, `pinned_at`.
- `POST /api/agent/lists/{id}/members` — `{ person_id }`.
- `DELETE /api/agent/lists/{id}/members/{personId}?confirm=true`

### Connection groups
- `GET|POST /api/agent/connection-groups` — POST body `{ name, things_to_remember, important_dates }`.
- `GET|PATCH|DELETE /api/agent/connection-groups/{id}` — PATCH writable: `name`, `things_to_remember`, `important_dates`.
- `POST /api/agent/connection-groups/{id}/members` — `{ person_id, order }`.
- `DELETE /api/agent/connection-groups/{id}/members/{personId}?confirm=true`

### Linked people (one-directional edges)
- `GET /api/agent/linked-people?personId=`
- `POST /api/agent/linked-people` — `{ person_id, linked_person_id, description }`. Both people must belong to the impersonated user.
- `PATCH /api/agent/linked-people/{id}` — `{ description }`.
- `DELETE /api/agent/linked-people/{id}?confirm=true`

### Working notes (on-demand plans with items + headings; one level of nesting)
`{id}` accepts a numeric id OR the literal `latest` (404 if no notes yet).
- `GET /api/agent/working-notes`
- `POST /api/agent/working-notes` — `{ priorities_text? }`.
- `GET /api/agent/working-notes/{id|latest}` — returns `{ working_note, items }`.
- `PATCH /api/agent/working-notes/{id|latest}` — `{ priorities_text }`.
- `DELETE /api/agent/working-notes/{id|latest}?confirm=true`
- `POST /api/agent/working-notes/{id|latest}/items` — `{ content, parent_id?, is_heading? }`. `parent_id` must reference a heading in the same note. `sort_order` auto-assigned.
- `PATCH /api/agent/working-note-items/{itemId}` — writable: `content`, `checked`, `is_heading`, `sort_order`, `parent_id`.
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

### Groceries
At most one active list per user. Creating a new list retires the old one. `{id}` accepts numeric id OR `active` (404 if none).
- `GET /api/agent/groceries/lists` — all lists with `item_count`, `unchecked_count`.
- `POST /api/agent/groceries/lists` — `{ name? }`. Creates new active list.
- `GET /api/agent/groceries/lists/{id|active}` — returns `{ grocery_list, items }`.
- `PATCH /api/agent/groceries/lists/{id|active}` — writable: `name`, `active`.
- `DELETE /api/agent/groceries/lists/{id|active}?confirm=true`
- `POST /api/agent/groceries/lists/{id|active}/items` — `{ name, note? }`.
- `PATCH /api/agent/groceries/items/{itemId}` — writable: `name`, `note`, `checked`. Setting `checked: true` auto-sets `checked_at`; `false` clears it.
- `DELETE /api/agent/groceries/items/{itemId}?confirm=true`

### Audit log (read-only)
- `GET /api/agent/audit-log?userId=&since=&action=&resourceType=&limit=&offset=` — returns `{ entries: [...] }`. Bodies stored as SHA-256 digest, not raw.

---

## Primary flows (worked end-to-end)

These three flows cover the main use cases. Each shows the user prompt, the curl calls, the expected response JSON, and how to branch on ambiguity or missing parent records.

---

### Flow A — Add a moment for a contact

Short-form phrasings like *"Sam likes pineapple pizza"* or *"Jamie's kid started kindergarten today"* are moments. Treat the first word/name as the person to look up and the rest as the moment content.

**User:** "Sam likes pineapple pizza."

**Step 1. Search for the person.**
```bash
curl -s "https://app.nexoprm.com/api/agent/people?q=sam" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

Expected response:
```json
{
  "people": [
    { "id": "42", "name": "Sam Rivera", "email": "sam@example.com", "phone": null }
  ]
}
```

**Branch on match count:**

- **1 match** → use `people[0].id` and proceed to step 2. No need to ask.
- **0 matches** → ask before creating:
  > "I don't have a Sam yet. Want me to create a new contact 'Sam' and log the moment, or did you mean someone else?"

  If confirmed, create first:
  ```bash
  curl -s -X POST "https://app.nexoprm.com/api/agent/people" \
    -H "Authorization: Bearer $NEXO_API_KEY" \
    -H "X-Nexo-User: $NEXO_USER" \
    -H "Content-Type: application/json" \
    -d '{"name":"Sam"}'
  ```
  Response: `{ "person": { "id": "57", "name": "Sam", ... } }` (201). Use that id.

- **2+ matches** → list candidates **with ids** and wait. Never guess.
  ```json
  {
    "people": [
      { "id": "42", "name": "Sam Rivera", "email": "sam@example.com", "phone": null },
      { "id": "88", "name": "Sam Okafor", "email": null,              "phone": "+1 555-0134" }
    ]
  }
  ```
  Ask:
  > "I have two Sams — which one?
  > - **#42** Sam Rivera (sam@example.com)
  > - **#88** Sam Okafor (+1 555-0134)"

**Step 2. Log the moment.**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/moments" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"person_id":"42","content":"Sam likes pineapple pizza."}'
```

Expected response (201):
```json
{
  "moment": {
    "id": "812",
    "person_id": "42",
    "content": "Sam likes pineapple pizza.",
    "created_at": "2026-04-17T14:30:00Z"
  },
  "ai_analysis_queued": true
}
```

**Step 3. Report back.** Always tell the user what was written, with ids:
> "Logged moment #812 on Sam Rivera (#42): 'Sam likes pineapple pizza.' AI analysis queued."

---

### Flow B — Add a grocery item

**User:** "Add milk to my groceries."

**Step 1. Try adding to the active list directly.**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/groceries/lists/active/items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"name":"milk"}'
```

Expected response (201):
```json
{
  "item": {
    "id": "3041",
    "grocery_list_id": "17",
    "name": "milk",
    "note": null,
    "checked": false,
    "checked_at": null
  }
}
```

Report back with ids:
> "Added 'milk' (#3041) to groceries list #17."

**Branch: no active list yet (404).** Response:
```json
{ "error": "no active grocery list", "code": "not_found" }
```

Create one, then retry:
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/groceries/lists" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{}'
```
Response: `{ "grocery_list": { "id": "17", "name": null, "active": true, ... } }` (201).

Then repeat the `POST .../lists/active/items` call.

**Ambiguity check:** if the user writes "add apples and bread" — two items — ask once:
> "Add those as two separate items (apples, bread)?"

---

### Flow C — Add to a working note (plan) item

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

## Other common operations (quick reference)

- **Look up a birthday:** `GET /people?q=...` → `GET /people/{id}` → scan `important_dates`.
- **Mark a reminder handled:** `GET /ai-reminders?status=new` → `PATCH /ai-reminders/{id}` with `{ "status": "done" }`.
- **Add a durable fact about someone:** resolve id → `POST /things-to-remember` with `{ person_id, content }`.
- **Check off a plan item:** `GET /working-notes/latest` → find item → `PATCH /working-note-items/{id}` with `{ "checked": true }`.
- **Delete anything:** append `?confirm=true`. Only after explicit user intent. Example:
  ```bash
  curl -s -X DELETE "https://app.nexoprm.com/api/agent/moments/812?confirm=true" \
    -H "Authorization: Bearer $NEXO_API_KEY" \
    -H "X-Nexo-User: $NEXO_USER"
  ```
- **Dry-run a write** (validate without persisting): add `-H "X-Nexo-Dry-Run: true"` to any POST/PATCH/DELETE.
