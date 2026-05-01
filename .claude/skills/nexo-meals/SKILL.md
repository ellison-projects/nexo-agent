---
name: nexo-meals
description: Use for meals and food log operations — saving meal ideas, logging food intake, tracking calories. Triggers: "save this recipe", "log that I ate X", "what did I eat today", "add a meal idea". Calls the NexoPRM Agent API at app.nexoprm.com. Runs in a forked subagent — when invoking, pass the user's full intent as the argument, since this skill has no access to conversation history.
context: fork
---

# NexoPRM Meals & Food Log Skill

## Your task

$ARGUMENTS

Fulfill the request above using the NexoPRM API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found. If the request is a read, return the data the caller needs. If it's a write, confirm it happened.

---

Personal-relationship-manager API, meals and food log subset. Every request uses a god-mode bearer token plus a per-user impersonation header.

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
4. **Always report back what you updated.** After every successful write, tell the user in one line what changed and include the id. Example: *"Logged 'Chicken salad' (#42) to your food log."*

## Error shape

```json
{ "error": "human-readable message", "code": "error_code" }
```
Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `internal_error`, `missing_user_header`, `unknown_user`, `service_unavailable`.

## Data format

- IDs are **strings** (bigints serialized as text).
- Timestamps are ISO 8601 UTC.
- Request bodies use **snake_case** (`person_name`, `logged_at`), not camelCase.

---

## Endpoints

### Meals
Meal ideas repository — recipes, favorite restaurants, etc.
- `GET /api/agent/meals` — all meals.
- `POST /api/agent/meals` — `{ name, notes?, link? }`. `name` required.
- `GET /api/agent/meals/{id}` — single meal detail.
- `PATCH /api/agent/meals/{id}` — writable: `name`, `notes`, `link`.
- `DELETE /api/agent/meals/{id}?confirm=true`

### Food log
Track what you ate, when, and calories if desired. Can log for self or family members via `person_name`.
- `GET /api/agent/food-log?personName=&since=&until=&limit=&offset=` — query params all optional.
- `POST /api/agent/food-log` — only `description` required. Others: `person_name` (default ""), `calories`, `logged_at` (default NOW).
- `PATCH /api/agent/food-log/{id}` — writable: `person_name`, `description`, `calories`, `logged_at`.
- `DELETE /api/agent/food-log/{id}?confirm=true`

---

## Primary flows

### Flow A — Save a meal idea

**User:** "Save this recipe — Thai basil chicken with jasmine rice"

```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/meals" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Thai basil chicken with jasmine rice",
    "notes": "Quick weeknight dinner, uses holy basil if available"
  }'
```

Expected response (201):
```json
{
  "meal": {
    "id": "23",
    "user_id": "2",
    "name": "Thai basil chicken with jasmine rice",
    "notes": "Quick weeknight dinner, uses holy basil if available",
    "link": null,
    "created_at": "2026-04-30T12:00:00Z",
    "updated_at": "2026-04-30T12:00:00Z"
  }
}
```

Report back:
> "Saved 'Thai basil chicken with jasmine rice' (#23) to your meals."

**With a link:**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/meals" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Thai basil chicken",
    "link": "https://example.com/recipe"
  }'
```

---

### Flow B — Log food intake

**User:** "Log that I ate a chicken salad for lunch"

```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/food-log" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Chicken salad for lunch"
  }'
```

Expected response (201):
```json
{
  "entry": {
    "id": "104",
    "user_id": "2",
    "person_name": "",
    "description": "Chicken salad for lunch",
    "calories": null,
    "logged_at": "2026-04-30T17:30:00Z"
  }
}
```

Report back:
> "Logged 'Chicken salad for lunch' (#104) to your food log."

**With calories and specific time:**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/food-log" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Protein shake",
    "calories": 250,
    "logged_at": "2026-04-30T08:00:00Z"
  }'
```

**For a family member:**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/food-log" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{
    "person_name": "Jade",
    "description": "Mac and cheese"
  }'
```

---

### Flow C — View food log

**User:** "What did I eat today?"

```bash
curl -s "https://app.nexoprm.com/api/agent/food-log?since=2026-04-30T00:00:00Z" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

Response will include array of entries. Format for the user as a simple list with timestamps.

**Filter by person:**
```bash
curl -s "https://app.nexoprm.com/api/agent/food-log?personName=Jade" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

---

## Other common operations

- **View all meals:** `GET /api/agent/meals`
- **Update a meal:** `PATCH /api/agent/meals/{id}` with any of `name`, `notes`, `link`
- **Delete a meal:** `DELETE /api/agent/meals/{id}?confirm=true`
- **Update food log entry:** `PATCH /api/agent/food-log/{id}` — useful for correcting calories or description
- **Delete food log entry:** `DELETE /api/agent/food-log/{id}?confirm=true`
