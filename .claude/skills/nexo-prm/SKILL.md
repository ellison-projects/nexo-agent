---
name: nexo-prm
description: Use when the user wants to read or write their personal relationship data in NexoPRM — people, moments (timestamped observations about someone), things to remember, AI reminders, relationships, lists, connection groups (the way to link people together), working notes (plans/todos), areas of focus, meals, food log, groceries, home items (household chores/maintenance), or stash (pocket knowledge base for non-person facts like products, places, gate codes). Also handles "debrief" — a read-only roll-up of open todos across home, groceries, and the current plan. Invoke for requests like "log that Sarah mentioned X", "who is Alex's birthday", "add milk to my groceries", "what's on my plan", "link Sam to John", "remind me that Jamie prefers texting", "remember that I like Reach floss", "save this cafe", "debrief me", or "what are my open todos". Calls the NexoPRM Agent API at app.nexoprm.com. Runs in a forked subagent — when invoking, pass the user's full intent as the argument (e.g. `Add 'Coke Zero 12-pack' to Matt's grocery list`), since this skill has no access to conversation history.
context: fork
---

# NexoPRM Agent API

## Your task

$ARGUMENTS

Fulfill the request above using the NexoPRM API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found. If the request is a read, return the data the caller needs. If it's a write, confirm it happened.

---

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

### Briefing (one-shot situational awareness)
Read-only roll-up of the user's whole state. Use for open-ended prompts ("debrief me", "what's going on", "catch me up") and as grounded context before answering anything broad. Window is ~14 days forward; 7 days back for recent moments.
- `GET /api/agent/briefing` — no query params. Response top-level keys: `generated_at`, `window_days`, `user`, `pillars`, `goals`, `trigger_list`, `upcoming_important_dates`, `ai_reminders` (`{ overdue, upcoming, recently_done }`), `working_note_reminders`, `working_notes`, `things_to_remember`, `recent_moments`, `pinned_people`, `stale_people`, `pinned_lists`, `connection_groups`, `food_log`, `grocery_items`, `home_items`, `meal_plans`. Drill into dedicated endpoints only when you need more than the briefing contains.

### People
- `GET /api/agent/people?q=&limit=&offset=` — search by name/email/phone substring.
- `POST /api/agent/people` — only `name` required. Other fields: `email`, `phone`, `address`, `important_dates` (array of `{label, date, recurring}`), `relationship` (`{connectionType}`), `topics` (string array), `pinned_at`.
- `GET /api/agent/people/{id}` — **THE endpoint for learning everything about a person in one call.** Returns `person` + `moments` (up to 100, each with `images`) + `things_to_remember` + `lists` + `connection_groups` + `relationships` (couple/family groups) + `saved_articles` + `ai_reminders` (up to 100, all statuses) + `ai_summary`. Use this for "what do I know about X" or "catch me up on Sarah" queries.
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
Two sources: `moment` (AI-generated from a moment) and `manual` (agent-created one-offs via POST).
- `GET /api/agent/ai-reminders?personId=&status=&dueBefore=&source=&limit=&offset=` — status one of `new`, `done`, `dismissed`. `source` one of `moment`, `manual`.
- `POST /api/agent/ai-reminders` — create a one-off manual reminder. Required: `due_at`, `message_template`. Optional: `notes`, `person_id`, `category`, `rationale`, `status`. Stored with `source='manual'`, `moment_id=null`. `message_template` is the short line; use `notes` for longer details the user will want when the reminder surfaces.
- `GET /api/agent/ai-reminders/{id}` — response includes `source`; manual reminders have `moment_id=null`.
- `PATCH /api/agent/ai-reminders/{id}` — update any subset of `status`, `due_at`, `message_template`, `notes`, `person_id`. Pass `person_id: null` to detach the person, or `notes: null`/`""` to clear notes. Works for both moment-sourced and manual reminders.

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
Connection groups are the **only** way to link people together (couples, families, teams, friend circles). When the user says "link Sam to John" or "link Eli's friend Jake", find an existing group or create one and add both members. Each member can carry an optional `role` ("spouse", "child", "parent", "sibling", etc.) describing their position in that group.

**Two different concepts:**
- `person.relationship.label` — "Who is Sam to the user?" (e.g. "sister", "best friend", "boss")
- `connection_group_members.role` — "Who is Sam within **this** group?" (e.g. "spouse" in her couple group, "sibling" in the family group)

Set `role` when the user's phrasing gives a semantic hint ("link my sister's husband to her" → add him with `role: "spouse"`). Leave it `null` when ambiguous — the group's name carries the context.

- `GET|POST /api/agent/connection-groups` — POST body `{ name, things_to_remember, important_dates }`.
- `GET|PATCH|DELETE /api/agent/connection-groups/{id}` — GET returns members with `role`. PATCH writable: `name`, `things_to_remember`, `important_dates`.
- `POST /api/agent/connection-groups/{id}/members` — `{ person_id, role?, order? }`. `role` is optional free-form string.
- `PATCH /api/agent/connection-groups/{id}/members/{personId}` — set/clear a member's `role`. Body: `{ "role": "spouse" }` or `{ "role": null }`.
- `DELETE /api/agent/connection-groups/{id}/members/{personId}?confirm=true`

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

### Flow D — Debrief (todos rollup via the briefing endpoint)

**User:** "Debrief." (also: "what are my open todos?", "summary of my todos")

Single-call, read-only. The briefing endpoint already rolls up everything Debrief needs — don't recreate it from individual calls.

**Step 1. Fetch the briefing.**

```bash
curl -s "https://app.nexoprm.com/api/agent/briefing" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

**Step 2. Pick out the three todo-relevant sections.** The briefing has many more fields (pillars, goals, stale people, etc.); ignore them for Debrief. If the user follows up with something broader, reach back into the same response.

- `home_items` — open household chores.
- `grocery_items` — items on the active grocery list.
- `working_note_reminders` — plan items flagged as due/overdue.

Trust the briefing — don't pad the output with extra calls to `/working-notes/latest` or the grocery/home endpoints. If a field looks incomplete, tell the user so they can fix the briefing server-side.

**Step 3. Render grouped, with ids so the user can check things off in a follow-up.**

> **Debrief — 9 open**
>
> **Home (3):**
> - #124 Replace smoke alarm batteries
> - #131 Regrout shower
> - #140 Hang picture in hallway
>
> **Groceries (2):**
> - #3041 milk
> - #3042 eggs
>
> **Plan reminders (4):**
> - #905 Call the plumber
> - #907 Draft Q2 plan
> - #910 Book dentist
> - #913 Email landlord

**Empty handling.**
- Any section with zero entries → omit it.
- All three empty → "Nothing open. You're clear."

---

### Flow E — Save a non-person fact to Stash

**User:** "Remember that I like Reach floss" or "Save this cafe — they had great salads"

Stash is for durable facts not tied to a person. If the user is telling you something about a specific person ("Sarah prefers texts"), use things-to-remember instead.

**Step 1. Create the stash entry.**
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

### Flow F — Link two people together

**User:** "Link Sam to John" or "Link my sister's husband to her" or "Link Eli's friend Jake"

Connection groups are the only way to link people. Flow: resolve both people → find existing group or create one → add members with optional roles.

**Step 1. Resolve both people.**
```bash
curl -s "https://app.nexoprm.com/api/agent/people?q=sam" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"

curl -s "https://app.nexoprm.com/api/agent/people?q=john" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

Disambiguate if needed (see Flow A).

**Step 2. Find an existing group or create one.**
```bash
# List existing groups
curl -s "https://app.nexoprm.com/api/agent/connection-groups" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

Scan for a group that already contains one of them or obviously fits (a couple group, "Eli's friends", etc.).

**If a group fits:**
```bash
# Add the other person with optional role
curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups/42/members" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"person_id":"88","role":"spouse"}'
```

**If no group fits, create one:**
```bash
# Create group
curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sam & John"}'

# Add both members
curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups/57/members" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"person_id":"42","role":"spouse"}'

curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups/57/members" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"person_id":"88","role":"spouse"}'
```

**Role hints from natural language:**
- "her husband" / "his wife" → `"spouse"`
- "Eli's friend" → leave `role` null (group name "Eli's friends" says it)
- "my sister's son" → `"child"` (in a parents group) or `"nephew"` depending on context
- When in doubt, leave `role` null

Report back:
> "Added John (#88) to Sam & John group (#57) as spouse."

---

## Other common operations (quick reference)

- **"What do I know about Sarah?"** → `GET /people?q=sarah` to resolve id, then `GET /people/{id}` — returns everything (moments, things-to-remember, reminders, lists, groups, relationships, articles, ai_summary) in one call.
- **Look up a birthday:** `GET /people?q=...` → `GET /people/{id}` → scan `important_dates`.
- **Link two people:** resolve both ids → `GET /connection-groups` to find existing group or `POST /connection-groups` to create → `POST /connection-groups/{id}/members` with `{ person_id, role? }` for each. See Flow F.
- **Set/update a member's role in a group:** `PATCH /connection-groups/{groupId}/members/{personId}` with `{ "role": "spouse" }` or `{ "role": null }` to clear.
- **Create a manual reminder:** `POST /ai-reminders` with `{ "due_at": "2026-04-25T17:00:00Z", "message_template": "Check in with Sarah", "notes": "Ask about her dad's recovery", "person_id": "42" }` (person_id and notes optional).
- **Update a reminder's due date or message:** `PATCH /ai-reminders/{id}` with any subset of `{ "due_at": "...", "message_template": "...", "notes": "...", "person_id": "..." }`. Works for both moment-sourced and manual reminders.
- **Mark a reminder handled:** `GET /ai-reminders?status=new` → `PATCH /ai-reminders/{id}` with `{ "status": "done" }`.
- **Add a durable fact about someone:** resolve id → `POST /things-to-remember` with `{ person_id, content }`.
- **Save a non-person fact:** `POST /stash` with `{ "title": "...", "note": "...", "tags": [...] }`. Use for products, places, gate codes, etc.
- **Check off a plan item:** `GET /working-notes/latest` → find item → `PATCH /working-note-items/{id}` with `{ "checked": true }`.
- **Add long-form notes to a heading:** `PATCH /working-note-items/{headingId}` with `{ "notes": "Long-form project context here..." }`.
- **Promote a heading to the top:** `GET /working-notes/latest` → reorder items array (heading + children to front) → `PUT /working-notes/latest/reorder` with `{ "item_ids": [...] }`.
- **Delete anything:** append `?confirm=true`. Only after explicit user intent. Example:
  ```bash
  curl -s -X DELETE "https://app.nexoprm.com/api/agent/moments/812?confirm=true" \
    -H "Authorization: Bearer $NEXO_API_KEY" \
    -H "X-Nexo-User: $NEXO_USER"
  ```
- **Dry-run a write** (validate without persisting): add `-H "X-Nexo-Dry-Run: true"` to any POST/PATCH/DELETE.
