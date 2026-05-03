---
name: nexo-notebooks
description: Use for managing notebooks (ongoing topics/threads) — creating notebooks, adding notes and reflections, managing next actions, linking people. Invoke for requests like "add a note to my father-son trip notebook", "what notebooks do I have", "create a new notebook for X", "add a reflection about Y". Calls the NexoPRM Agent API at app.nexoprm.com. Runs in a forked subagent — when invoking, pass the user's full intent as the argument, since this skill has no access to conversation history.
context: fork
---

# NexoPRM Notebooks Skill

## Your task

$ARGUMENTS

Fulfill the notebook-related request above using the NexoPRM API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found.

---

Personal-relationship-manager API, notebooks subset. Every request uses a god-mode bearer token plus a per-user impersonation header.

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
4. **Always report back what you updated.** After every successful write, tell the user in one line what changed and on which record. Example: *"Added note #812 to Annual Father-Son Trip notebook (#3)."*

## Error shape

```json
{ "error": "human-readable message", "code": "error_code" }
```
Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `internal_error`, `missing_user_header`, `unknown_user`, `service_unavailable`.

## Data format

- IDs are **strings** (bigints serialized as text).
- Timestamps are ISO 8601 UTC.
- Request bodies use **snake_case** (`notebook_id`, `person_id`, `target_date`), not camelCase.

**Note:** The API uses "notebooks" terminology in endpoints. Notebooks are ongoing topics you keep coming back to, not necessarily outcome-oriented threads.

---

## Endpoints

### Notebooks (Projects)
Multi-week initiatives and ongoing topics. Each has notes, next actions, optional people links, tags, and optional target date.

- `GET /api/agent/notebooks?tag=&include=archived` — list notebooks. Excludes archived by default. Filter by tag.
- `POST /api/agent/notebooks` — create notebook. Required: `title`. Optional: `description`, `overview_notes`, `pillar` (`family`/`relationships`/`health`/`ambitions`), `target_date`, `tags`.
- `GET /api/agent/notebooks/tags` — distinct tags across non-archived notebooks with counts.
- `GET /api/agent/notebooks/{id}` — full detail: `notebook`, `notes` (each with `images` and `tags`), `actions`, `linked_people`, `reminders`.
- `PATCH /api/agent/notebooks/{id}` — partial update. Writable: `title`, `description`, `overview_notes`, `pillar`, `target_date`, `tags`, `pinned_at`, `archived_at`.
- `DELETE /api/agent/notebooks/{id}?confirm=true` — cascades to notes, actions, images, reminders.

### Notebook Notes
- `POST /api/agent/notebooks/{id}/notes` — add note. Required: `content`. Optional: `kind` (`note` default, or `reflection`), `tags` (string array), `image_urls`, `created_at`.
- `PATCH /api/agent/notebooks/{id}/notes/{noteId}` — edit content/kind/tags; `add_image_urls`, `remove_image_ids`. Pass `tags: []` to clear all tags.
- `DELETE /api/agent/notebooks/{id}/notes/{noteId}?confirm=true`

**Note kinds:**
- `note` = "what happened" (raw observation)
- `reflection` = "the lesson" (distilled takeaway)

**Per-note tags:** Use for slicing long timelines within one notebook. Example: annual father-son trip notebook — tag each year's notes with `["2026"]`, `["2027"]` to filter without splitting notebooks.

### Next Actions
- `POST /api/agent/notebooks/{id}/actions` — add next-action. Required: `content`. Optional: `due_date`.
- `PATCH /api/agent/notebooks/{id}/actions/{actionId}` — edit content/due/sort or mark done via `done_at` (ISO or null).
- `DELETE /api/agent/notebooks/{id}/actions/{actionId}?confirm=true`

### People Links
- `POST /api/agent/notebooks/{id}/people` — link person. `{ "person_id": "..." }`.
- `DELETE /api/agent/notebooks/{id}/people/{personId}?confirm=true` — unlink.

---

## Common operations

- **Create a notebook:** `POST /notebooks` with `{ "title": "Annual Father-Son Trip", "pillar": "family", "tags": ["jackson", "father-son"] }`.
- **Add a note:** Find or create the notebook → `POST /notebooks/{id}/notes` with `{ "content": "...", "kind": "note" }`.
- **Add a reflection:** Same as note but use `{ "content": "...", "kind": "reflection" }`.
- **Add a next action:** `POST /notebooks/{id}/actions` with `{ "content": "Talk to Celine about destination" }`.
- **Link a person to notebook:** `POST /projects/{id}/people` with `{ "person_id": "102" }`.
- **View all notebooks:** `GET /projects` returns list with basic info.
- **View notebook details:** `GET /projects/{id}` returns everything in one call.
- **Tag a note:** When creating/updating, pass `tags: ["2026"]` to tag the note.
- **Archive a notebook:** `PATCH /projects/{id}` with `{ "archived_at": "<ISO_timestamp>" }` or `null` to unarchive.
