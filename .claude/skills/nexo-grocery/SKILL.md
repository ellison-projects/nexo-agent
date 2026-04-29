---
name: nexo-grocery
description: Use for grocery list operations — adding items, checking them off, viewing list, managing stash entries. Triggers: "add milk", "what's on my grocery list", "check off eggs", "save to stash". Searches Stash first for brand preferences. Runs inline — can ask for confirmation.
---

# NexoPRM Grocery Skill

Fulfill grocery-related requests using the NexoPRM API reference below. You have full conversation context and can ask Matt for confirmation or clarification as needed.

---

Personal-relationship-manager API, grocery subset. Every request uses a god-mode bearer token plus a per-user impersonation header.

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
4. **ALWAYS search Stash first before adding grocery items.** Use `GET /stash?tag=grocery&q=<item>` to check for existing curated product entries. If a match exists, pass only `stash_id` (server copies stash title to name). This preserves brand preferences.
5. **Check for existing items before adding.** When the user asks to add items, first check if there are still unchecked items on the active grocery list:
   - If there are unchecked items, **always confirm** — never assume the list is outdated: "You still have X unchecked items on your current list. Add to this list or start a new one?"
   - If the list is empty (all items checked off), just create a new list and start adding items without asking.
6. **Always report back what you updated.** After every successful write, tell the user in one line what changed and on which record — include the list/note name and the id. Example: *"Added 'Coke Zero 12-pack' (#3041) to groceries list #17."*

## Error shape

```json
{ "error": "human-readable message", "code": "error_code" }
```
Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `internal_error`, `missing_user_header`, `unknown_user`, `service_unavailable`.

## Data format

- IDs are **strings** (bigints serialized as text).
- Timestamps are ISO 8601 UTC.
- Request bodies use **snake_case** (`stash_id`, `photo_urls`), not camelCase.

---

## Endpoints

### Groceries
At most one active list per user. Creating a new list retires the old one. `{id}` accepts numeric id OR `active` (404 if none).

- `GET /api/agent/groceries/lists` — all lists with `item_count`, `unchecked_count`.
- `POST /api/agent/groceries/lists` — `{ name? }`. Creates new active list.
- `GET /api/agent/groceries/lists/{id|active}` — returns `{ grocery_list, items }`. Items include `stash_id` if linked.
- `PATCH /api/agent/groceries/lists/{id|active}` — writable: `name`, `active`.
- `DELETE /api/agent/groceries/lists/{id|active}?confirm=true`
- `POST /api/agent/groceries/lists/{id|active}/items` — requires `name` OR `stash_id`. If `stash_id` provided, omit `name` (server fills from stash title). Optional: `note`, `photo_urls`.
- `PATCH /api/agent/groceries/items/{itemId}` — writable: `name`, `note`, `checked`. `stash_id` is immutable. Setting `checked: true` auto-sets `checked_at`; `false` clears it.
- `DELETE /api/agent/groceries/items/{itemId}?confirm=true`

### Stash (grocery-tagged entries)
Pocket knowledge base for non-person facts. For groceries, these are curated product entries with brand/size details.

- `GET /api/agent/stash?q=&tag=grocery&limit=&offset=` — `q` matches title/note/location (case-insensitive). `tag=grocery` filters to grocery items. Ordered by `updated_at DESC`.
- `POST /api/agent/stash` — required: `title`. Optional: `note`, `location`, `tags` (string array), `photo_urls`. For grocery items, include `"grocery"` in tags.
- `GET /api/agent/stash/{id}` — detail with attached `photos`.
- `PATCH /api/agent/stash/{id}` — writable: `title`, `note`, `location`, `tags` (replaces full array), and/or `add_photo_urls` / `remove_photo_ids`.
- `DELETE /api/agent/stash/{id}?confirm=true` — cascades to photos.

---

## Primary flow — Add a grocery item

**User:** "Add milk to my groceries."

**Step 1. Search Stash first (ALWAYS do this).**
```bash
curl -s "https://app.nexoprm.com/api/agent/stash?tag=grocery&q=milk" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

**If match found:**
```bash
# Use stash_id, omit name
curl -s -X POST "https://app.nexoprm.com/api/agent/groceries/lists/active/items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"stash_id":"42"}'
```

Response will include the stash title as `name`.

**If no match:**
```bash
# Use name only
curl -s -X POST "https://app.nexoprm.com/api/agent/groceries/lists/active/items" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"name":"Milk"}'
```

Expected response (201):
```json
{
  "item": {
    "id": "3041",
    "grocery_list_id": "17",
    "name": "Milk",
    "note": null,
    "checked": false,
    "checked_at": null,
    "stash_id": null
  }
}
```

Report back with ids:
> "Added 'Milk' (#3041) to groceries list #17."

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

**Unclear or confusing requests:** If the user's request sounds confusing, ambiguous, or might be a typo, confirm first before adding to the list. For example:
- "cilantro like burritos" → sounds unclear, could be "cilantro lime burritos" or just "cilantro" - ask: "Did you mean 'cilantro lime burritos' or just 'cilantro'?"
- "choclate milk" → obvious typo for "chocolate milk" - just fix it
- "banan" → could be "banana" or typo - confirm: "Did you mean 'bananas'?"

This prevents adding wrong items based on misinterpretation or typos.

---

## Other common operations

- **View grocery list:** `GET /groceries/lists/active` returns the active list with all items.
- **Check off an item:** Find the item id, then `PATCH /groceries/items/{id}` with `{ "checked": true }`.
- **Uncheck an item:** `PATCH /groceries/items/{id}` with `{ "checked": false }`.
- **Remove an item:** `DELETE /groceries/items/{id}?confirm=true` (only after explicit intent).
- **Save a product to stash:** `POST /stash` with `{ "title": "Coke Zero 12-pack", "note": "...", "tags": ["grocery"] }`. Next time the user adds "coke zero", the stash search will find it.
- **Search stash for grocery items:** `GET /stash?tag=grocery&q=<keyword>`.
