---
name: nexo-prm
description: Use for areas of focus and stash (pocket knowledge base for non-person facts like products, places, gate codes). Invoke for requests like "what are my focus areas", "remember that I like Reach floss", "save this cafe". **For person-attached data, use `nexo-people`.** **For grocery operations, use `nexo-grocery`.** **For notebooks/projects, use `nexo-notebooks`.** **For plan/todos/debrief, use `nexo-plan`.** **For meals/food log, use `nexo-meals`.** **For home items/chores, use `nexo-home`.** Calls the NexoPRM Agent API at app.nexoprm.com. Runs in a forked subagent — when invoking, pass the user's full intent as the argument, since this skill has no access to conversation history.
context: fork
---

# NexoPRM Agent API

## Your task

$ARGUMENTS

Fulfill the request above using the NexoPRM API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found. If the request is a read, return the data the caller needs. If it's a write, confirm it happened.

---

Personal-relationship-manager API. Every request uses a god-mode bearer token plus a per-user impersonation header. This skill covers **areas of focus** and **stash** only. For person-attached resources, see `nexo-people`. For groceries, see `nexo-grocery`. For notebooks/projects, see `nexo-notebooks`. For plan/todos, see `nexo-plan`. For meals/food log, see `nexo-meals`. For home items, see `nexo-home`.

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
9. **For notebook/project operations, defer to `nexo-notebooks`.** If $ARGUMENTS asks you to create notebooks, add notes/reflections to projects, manage next actions, or link people to projects, return a note saying "this belongs in nexo-notebooks" rather than calling those endpoints from here.
10. **For plan/todos operations, defer to `nexo-plan`.** If $ARGUMENTS asks you to add todos, check off plan items, debrief, or view the current plan, return a note saying "this belongs in nexo-plan" rather than calling those endpoints from here.
11. **For meals/food log operations, defer to `nexo-meals`.** If $ARGUMENTS asks you to save meal ideas, log food intake, or view food log, return a note saying "this belongs in nexo-meals" rather than calling those endpoints from here.
12. **For home items operations, defer to `nexo-home`.** If $ARGUMENTS asks you to add home tasks, mark chores as done, or manage home items, return a note saying "this belongs in nexo-home" rather than calling those endpoints from here.

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

### Areas of focus (ongoing life themes; typically 3–5)
- `GET|POST /api/agent/areas-of-focus` — POST body `{ title, description, sort_order }`.
- `GET|PATCH|DELETE /api/agent/areas-of-focus/{id}` — PATCH writable: `title`, `description`, `sort_order`.

### Stash
Pocket knowledge base for non-person facts. Products, places, gate codes, stray info worth recalling. Title + optional note + optional location + tags + optional photos.
- `GET /api/agent/stash?q=&tag=&limit=&offset=` — `q` matches title/note/location (case-insensitive). `tag` is exact-match. Ordered by `updated_at DESC`. Each row includes `photo_count`.
- `POST /api/agent/stash` — required: `title`. Optional: `note`, `location`, `tags` (string array), `photo_urls`.
- `GET /api/agent/stash/{id}` — detail with attached `photos`.
- `PATCH /api/agent/stash/{id}` — writable: `title`, `note`, `location`, `tags` (replaces full array), and/or `add_photo_urls` / `remove_photo_ids`.
- `DELETE /api/agent/stash/{id}?confirm=true` — cascades to photos.

---

## Primary flow

### Save a non-person fact to Stash

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

## Other common operations

- **View all areas of focus:** `GET /api/agent/areas-of-focus`
- **Update an area of focus:** `PATCH /api/agent/areas-of-focus/{id}` with `title`, `description`, or `sort_order`
- **Delete an area of focus:** `DELETE /api/agent/areas-of-focus/{id}?confirm=true`
- **Search stash by keyword:** `GET /api/agent/stash?q=keyword`
- **Search stash by tag:** `GET /api/agent/stash?tag=tagname`
- **Update a stash entry:** `PATCH /api/agent/stash/{id}` with any of `title`, `note`, `location`, `tags`, `add_photo_urls`, `remove_photo_ids`
- **Delete a stash entry:** `DELETE /api/agent/stash/{id}?confirm=true`
