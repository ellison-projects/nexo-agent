---
name: nexo-home
description: Use for home items — household chores and maintenance tasks like "replace smoke alarm batteries", "regrout shower". Triggers: "add a home task", "what home items do I have", "mark X as done", "add notes to home item". Calls the NexoPRM Agent API at app.nexoprm.com. Runs in a forked subagent — when invoking, pass the user's full intent as the argument, since this skill has no access to conversation history.
context: fork
---

# NexoPRM Home Items Skill

## Your task

$ARGUMENTS

Fulfill the request above using the NexoPRM API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found. If the request is a read, return the data the caller needs. If it's a write, confirm it happened.

---

Personal-relationship-manager API, home items subset. Every request uses a god-mode bearer token plus a per-user impersonation header.

**Full API reference (source of truth):** https://app.nexoprm.com/agentapi/llm.md — fetch this if an endpoint or field shape isn't covered below, or if a call 404s / rejects unexpectedly.

## Auth

Read from env:
- `NEXO_API_KEY` — bearer token
- `NEXO_USER` — email or numeric id of the user to impersonate

Required headers:
- `Authorization: Bearer $NEXO_API_KEY`
- `X-Nexo-User: $NEXO_USER`
- `Content-Type: application/json` on writes

Optional headers:
- `X-Nexo-Dry-Run: true` — validate a write without persisting

Base URL: `https://app.nexoprm.com`

## Safety rules

1. **Every `DELETE` must include `?confirm=true`** or the server returns `400 validation_error`. Only delete when the user's intent is explicit.
2. **Never log or echo `NEXO_API_KEY`.**
3. **CRITICAL: If any API endpoint fails (non-2xx response), STOP immediately and report the failure.** Include the endpoint, method, status code, and error response.
4. **Always report back what you updated.** After every successful write, tell the user in one line what changed and include the id. Example: *"Added 'Replace smoke alarm batteries' (#124) to your home items."*

## Error shape

```json
{ "error": "human-readable message", "code": "error_code" }
```
Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `internal_error`, `missing_user_header`, `unknown_user`, `service_unavailable`.

## Data format

- IDs are **strings** (bigints serialized as text).
- Timestamps are ISO 8601 UTC.
- Request bodies use **snake_case** (`done_at`), not camelCase.
- "Open" items = `done_at IS NULL`.

---

## Endpoints

### Home items
Household maintenance / chores ("replace smoke alarm batteries", "regrout shower"). One implicit list per user — no parent list resource.

- `GET /api/agent/home-items` — open items only by default. Pass `?done=true` to include completed. Returns `{ home_items: [...] }`; each row has `note_count`.
- `POST /api/agent/home-items` — `{ title }` required. Returns `{ home_item }`, 201.
- `GET /api/agent/home-items/{id}` — returns `{ home_item, notes }`.
- `PATCH /api/agent/home-items/{id}` — writable: `title`, `done_at` (ISO timestamp to mark done, `null` to reopen).
- `DELETE /api/agent/home-items/{id}?confirm=true` — cascades to notes.
- `POST /api/agent/home-items/{id}/notes` — `{ content }`. Returns `{ note }`, 201.
- `PATCH /api/agent/home-item-notes/{noteId}` — writable: `content`.
- `DELETE /api/agent/home-item-notes/{noteId}?confirm=true`

---

## Primary flows

### Flow A — Add a home item

**User:** "Add 'replace smoke alarm batteries' to my home items"

```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/home-items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"title":"Replace smoke alarm batteries"}'
```

Expected response (201):
```json
{
  "home_item": {
    "id": "124",
    "user_id": "2",
    "title": "Replace smoke alarm batteries",
    "done_at": null,
    "created_at": "2026-04-30T12:00:00Z",
    "updated_at": "2026-04-30T12:00:00Z",
    "note_count": 0
  }
}
```

Report back:
> "Added 'Replace smoke alarm batteries' (#124) to your home items."

---

### Flow B — View open home items

**User:** "What home items do I have open?"

```bash
curl -s "https://app.nexoprm.com/api/agent/home-items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

Expected response (200):
```json
{
  "home_items": [
    {
      "id": "124",
      "user_id": "2",
      "title": "Replace smoke alarm batteries",
      "done_at": null,
      "created_at": "2026-04-30T12:00:00Z",
      "updated_at": "2026-04-30T12:00:00Z",
      "note_count": 0
    },
    {
      "id": "131",
      "user_id": "2",
      "title": "Regrout shower",
      "done_at": null,
      "created_at": "2026-04-28T10:15:00Z",
      "updated_at": "2026-04-28T10:15:00Z",
      "note_count": 2
    }
  ]
}
```

Format as a list:
> **Home items (2 open):**
> - #124 Replace smoke alarm batteries
> - #131 Regrout shower (2 notes)

---

### Flow C — Mark a home item as done

**User:** "Mark 'replace smoke alarm batteries' as done"

**Step 1. Find the item** (if you don't already have the id):
```bash
curl -s "https://app.nexoprm.com/api/agent/home-items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

**Step 2. Mark it done:**
```bash
curl -s -X PATCH "https://app.nexoprm.com/api/agent/home-items/124" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"done_at":"2026-04-30T18:00:00Z"}'
```

Report back:
> "Marked 'Replace smoke alarm batteries' (#124) as done."

**To reopen an item:**
```bash
curl -s -X PATCH "https://app.nexoprm.com/api/agent/home-items/124" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"done_at":null}'
```

---

### Flow D — Add notes to a home item

**User:** "Add a note to the shower task — 'need to buy grout first'"

**Step 1. Find the item id** (if needed):
```bash
curl -s "https://app.nexoprm.com/api/agent/home-items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

**Step 2. Add the note:**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/home-items/131/notes" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"content":"Need to buy grout first"}'
```

Expected response (201):
```json
{
  "note": {
    "id": "58",
    "home_item_id": "131",
    "content": "Need to buy grout first",
    "created_at": "2026-04-30T18:10:00Z"
  }
}
```

Report back:
> "Added note to 'Regrout shower' (#131)."

---

## Other common operations

- **View all home items including completed:** `GET /api/agent/home-items?done=true`
- **View a specific item with its notes:** `GET /api/agent/home-items/{id}` — returns `{ home_item, notes }`
- **Update item title:** `PATCH /api/agent/home-items/{id}` with `{ "title": "New title" }`
- **Update a note:** `PATCH /api/agent/home-item-notes/{noteId}` with `{ "content": "Updated content" }`
- **Delete a note:** `DELETE /api/agent/home-item-notes/{noteId}?confirm=true`
- **Delete an item:** `DELETE /api/agent/home-items/{id}?confirm=true` — cascades to all notes
