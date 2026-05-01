---
name: nexo-plan
description: Use for working notes (current plan) and todos — adding plan items, checking off tasks, managing headings, and the "debrief" todos rollup. Triggers: "what's on my plan", "add a todo", "debrief me", "check off X", "what are my open todos". Calls the NexoPRM Agent API at app.nexoprm.com. Runs in a forked subagent — when invoking, pass the user's full intent as the argument, since this skill has no access to conversation history.
context: fork
---

# NexoPRM Plan & Todos Skill

## Your task

$ARGUMENTS

Fulfill the request above using the NexoPRM API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found. If the request is a read, return the data the caller needs. If it's a write, confirm it happened.

---

Personal-relationship-manager API, plan/working-notes subset. Every request uses a god-mode bearer token plus a per-user impersonation header.

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
4. **Always report back what you updated.** After every successful write, tell the user in one line what changed and on which record — include the plan name and the id. Example: *"Added 'Call the plumber' (#904) to your current plan (note #61)."*

## Error shape

```json
{ "error": "human-readable message", "code": "error_code" }
```
Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `internal_error`, `missing_user_header`, `unknown_user`, `service_unavailable`.

## Data format

- IDs are **strings** (bigints serialized as text).
- Timestamps are ISO 8601 UTC.
- Request bodies use **snake_case** (`parent_id`, `is_heading`), not camelCase.
- "My current plan" → `/working-notes/latest` (404 if none exists — create one, then retry).

---

## Endpoints

### Briefing (for debrief)
Read-only roll-up of the user's state. Use for "debrief me" or "what are my open todos".
- `GET /api/agent/briefing` — returns `home_items` and `working_note_reminders` (among many other fields). Use these two for the debrief todos rollup.

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

---

## Primary flows

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

**Step 2. Pick out the two todo-relevant sections.** The briefing has many more fields (pillars, goals, stale people, etc.); ignore them for Debrief. If the user follows up with something broader, reach back into the same response.

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

## Other common operations

- **Check off a plan item:** `GET /working-notes/latest` → find item → `PATCH /working-note-items/{id}` with `{ "checked": true }`.
- **Add long-form notes to a heading:** `PATCH /working-note-items/{headingId}` with `{ "notes": "Long-form project context here..." }`.
- **Promote a heading to the top:** `GET /working-notes/latest` → reorder items array (heading + children to front) → `PUT /working-notes/latest/reorder` with `{ "item_ids": [...] }`.
- **Delete anything:** append `?confirm=true`. Only after explicit user intent.
