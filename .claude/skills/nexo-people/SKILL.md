---
name: nexo-people
description: |
  Use for person-attached data in NexoPRM — people, moments (timestamped observations about someone), things-to-remember (durable non-timestamped facts about someone), AI reminders (when attached to a person), relationships, connection groups (the way to link people together), lists (action rosters of people), and people reports. Calls the NexoPRM Agent API at app.nexoprm.com. Triggers: "log that Sarah mentioned X", "what do I know about Alex", "Sarah's birthday", "link Sam to John", "add Sarah's address", "remind me to text Cassie tomorrow", "Jamie prefers texting", "who haven't I categorized yet", "add Tom as a contact". Runs in a forked subagent — pass the user's full intent as the argument (e.g. `Add Sarah Chen's new address: 123 Main St`), since this skill has no access to conversation history.

  PRE-FLIGHT CHECKS — do these in the main thread BEFORE invoking the fork. They require an extra read invoke + a question to Matt before the final write invoke. Worth the friction; these specific cases get wrong-answered too easily otherwise.

  1. **Address add/update.** Invoke once with a read first (full person fetch — moments, groups, etc.). If the person has a spouse/partner (couple connection group, or any group member with role "spouse"/"partner"), ask Matt: "Update [spouse name]'s address too?" Then invoke the write(s) based on his answer.

  2. **Phone or email add/update.** Same pattern as address. Read the person + their connection groups. If household members exist (spouse, kids, parents), ask Matt whether the contact info is shared (family number, household email) before writing — if shared, offer to update all of them.

  3. **Creating a new person.** Invoke a search by name first (`q=<name>`). If a phone or email is provided, invoke a second search by that too. If a likely match surfaces (exact name, name variant like "Synder"/"Snyder", or shared phone/email), surface the match to Matt before creating: "Found [name] (#id) — update that one or create a new contact?" Don't auto-create when a near-match exists.

  4. **Adding a spouse/partner relationship.** After linking via connection group with role "spouse"/"partner", ask Matt whether to also create or attach to a household connection group (e.g. "Smith household") for shared things-to-remember and important dates. Don't auto-create — ask.

  5. **Moment that implies a durable fact.** Before invoking, classify the content. If it's a preference, allergy, dislike, important date, or other fact that's true beyond today (not just an event), ask Matt: "Log as a moment AND save as a thing-to-remember on [name]?" If he agrees, invoke once with both writes. Examples that are durable facts: "Sarah's allergic to peanuts", "Jamie prefers texts over calls", "Tom's birthday is March 4". Counter-examples (just events, no TTR): "Saw Sarah at the park", "Tom called about the trip".
context: fork
---

# NexoPRM Agent API — People

## Your task

$ARGUMENTS

Fulfill the request above using the API reference below. Report back concisely with what you did (endpoint called, id returned, etc.) or what you found. If the request is a read, return the data the caller needs. If it's a write, confirm it happened.

---

Personal-relationship-manager API. Every request uses a god-mode bearer token plus a per-user impersonation header. This skill covers the **person-attached** subset of the API. For non-person resources (working notes, groceries, home items, meals, food log, stash, projects, briefing/debrief), see the `nexo-prm` skill.

**Full API reference (source of truth):** https://app.nexoprm.com/agentapi/llm.md — fetch this if an endpoint or field shape isn't covered below, or if a call 404s / rejects unexpectedly.

## Auth

Read from env:
- `NEXO_API_KEY` — bearer token
- `NEXO_USER` — email or numeric id of the user to impersonate

Required headers on most endpoints:
- `Authorization: Bearer $NEXO_API_KEY`
- `X-Nexo-User: $NEXO_USER`
- `Content-Type: application/json` on writes

Optional headers:
- `X-Nexo-Dry-Run: true` — validate a write without persisting (use if unsure)

Base URL: `https://app.nexoprm.com`

## Safety rules

1. **Every `DELETE` must include `?confirm=true`** or the server returns `400 validation_error`. Only delete when intent is explicit.
2. **Never log or echo `NEXO_API_KEY`.**
3. **Disambiguate people before writing.** When the caller refers to someone by first name/nickname:
   - Search with `GET /api/agent/people?q=<name>`
   - 0 matches → the main thread should have asked already; if not clear in $ARGUMENTS, return a request for clarification
   - 1 match → proceed
   - 2+ matches → return candidates with ids and distinguishing info to the caller; don't guess
4. Prefer `PATCH` over recreate; most updates are idempotent.
5. **CRITICAL: If any API endpoint fails (non-2xx), STOP immediately and report the failure.** Include endpoint, method, status code, and error response. Do NOT continue attempting other operations.
6. **When unsure, ask first.** If a name is ambiguous, the content of a moment/item is unclear, or the right endpoint isn't obvious, surface the ambiguity rather than guessing.
7. **Always report back what you wrote.** After every successful write, tell the caller in one line what changed and on which record — include the person/group name and the id. Example: *"Logged moment #812 on Sarah Chen (#42)."* / *"Added John (#88) to Sam & John group (#57) as spouse."*
8. **When listing person candidates, always show ids.** Example: *"Two Sams — #42 Sam Rivera (sam@example.com), #88 Sam Okafor (+1 555-0134). Which one?"*

## Error shape

```json
{ "error": "human-readable message", "code": "error_code" }
```
Codes: `unauthorized`, `forbidden`, `not_found`, `validation_error`, `conflict`, `internal_error`, `missing_user_header`, `unknown_user`, `service_unavailable`.

## Data format

- IDs are **strings** (bigints serialized as text).
- Timestamps are ISO 8601 UTC.
- Request bodies use **snake_case** (`person_id`, `important_dates`, `pinned_at`).
- Omit `created_at` / `logged_at` to default to server NOW.

## List conventions

All list endpoints accept `limit` (default 50, max 200) and `offset` (default 0).

---

## Endpoints

### People
- `GET /api/agent/people?q=&limit=&offset=` — search by name/email/phone substring.
- `POST /api/agent/people` — only `name` required. Other fields: `email`, `phone`, `address`, `important_dates` (array of `{label, date, recurring}`), `relationship` (`{connectionType}`), `topics` (string array), `pinned_at`.
- `GET /api/agent/people/{id}` — **THE endpoint for learning everything about a person in one call.** Returns `person` + `moments` (up to 100, each with `images`) + `things_to_remember` + `lists` + `connection_groups` + `relationships` (couple/family groups) + `saved_articles` + `ai_reminders` (up to 100, all statuses) + `ai_summary`. Use this for "what do I know about X" or "catch me up on Sarah" — and as the first step in any address/contact-info pre-flight (so you can detect a spouse).
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
Two sources: `moment` (AI-generated from a moment) and `manual` (agent-created one-offs). Reminders can attach to a person and/or a project. This skill owns the endpoint; project-only reminders are usually created via `nexo-prm`'s project flow but use the same shape.
- `GET /api/agent/ai-reminders?personId=&projectId=&status=&dueBefore=&source=&limit=&offset=` — `status` ∈ `new|done|dismissed`. `source` ∈ `moment|manual`.
- `POST /api/agent/ai-reminders` — required: `due_at`, `message`. Optional: `notes`, `person_id`, `project_id`, `category`, `rationale`, `status`. Manual reminders stored with `source='manual'`, `moment_id=null`. `message` is the concise headline shown everywhere; `rationale` is short "why this exists" context; `notes` is longer free-form details.
- `GET /api/agent/ai-reminders/{id}`
- `PATCH /api/agent/ai-reminders/{id}` — update any subset of `status`, `due_at`, `message`, `notes`, `person_id`, `project_id`, `rationale`. Pass `person_id: null` / `project_id: null` to detach, `notes: null` / `""` to clear.

**For relative due times** (e.g. "remind me in 10 minutes"), use `./scripts/get-time.sh "+10 minutes"` to compute the ISO UTC `due_at` — never do timezone math by hand.

### Relationships
- `GET|POST /api/agent/relationships` — POST body `{ name, notes, reminder }`.
- `GET|PATCH|DELETE /api/agent/relationships/{id}` — PATCH writable: `name`, `notes`, `reminder`.
- `POST /api/agent/relationships/{id}/members` — `{ person_id }`.
- `DELETE /api/agent/relationships/{id}/members/{personId}?confirm=true`

### Connection groups
The **only** way to link people together (couples, families, teams, friend circles). When the user says "link Sam to John" or "link Eli's friend Jake", find an existing group or create one and add both members. Each member can carry an optional `role` ("spouse", "child", "parent", "sibling", etc.).

**Groups vs Lists** — both collect people but solve different jobs. Use a **group** when the collection has shared memory: shared `things_to_remember`, shared `important_dates`, or per-member `role`. Families, couples, and teams belong here. Use a **list** only for pure action rosters (scanning/filtering). Quick test: "If I could attach one shared note to this whole collection, would that make sense?" Yes → group. No → list.

**Two different concepts:**
- `person.relationship.label` — "Who is Sam to the user?" (e.g. "sister", "best friend", "boss")
- `connection_group_members.role` — "Who is Sam within **this** group?" (e.g. "spouse" in her couple group, "sibling" in the family group)

Set `role` when the phrasing gives a semantic hint ("link my sister's husband to her" → add him with `role: "spouse"`). Leave it `null` when ambiguous — the group's name carries context.

**Member payloads are enriched.** `GET /connection-groups/{id}` returns members with full Person context inlined (email, phone, address, relationship, important_dates, topics, pinned_at, last_activity_at). Usually no follow-up `/people/{id}` needed unless you need moments / things-to-remember / AI summary.

- `GET|POST /api/agent/connection-groups` — GET sorted pinned-first, then by `updated_at`. POST body `{ name, things_to_remember, important_dates }`.
- `GET|PATCH|DELETE /api/agent/connection-groups/{id}` — PATCH writable: `name`, `things_to_remember`, `important_dates`, `pinned_at`.
- `POST /api/agent/connection-groups/{id}/members` — `{ person_id, role?, order? }`.
- `PATCH /api/agent/connection-groups/{id}/members/{personId}` — `{ "role": "spouse" }` or `{ "role": null }`.
- `DELETE /api/agent/connection-groups/{id}/members/{personId}?confirm=true`

### Lists
Lightweight named rosters for action ("Active babysitters", "Christmas cards", "People to invite to barbecue"). No shared notes, no shared dates, no per-member roles. If the collection would benefit from shared context, use a connection group instead.

- `GET|POST /api/agent/lists` — POST body `{ name, pinned_at }`.
- `GET|PATCH|DELETE /api/agent/lists/{id}` — PATCH writable: `name`, `pinned_at`.
- `POST /api/agent/lists/{id}/members` — `{ person_id }`.
- `DELETE /api/agent/lists/{id}/members/{personId}?confirm=true`

### Reports (read-only rollups)

- `GET /api/agent/reports/people-by-connection-type?type=primary|secondary|unset` — people filtered by `relationship.connectionType`. `unset` returns people with no connectionType yet ("who haven't I categorized?"). Ordered by `last_activity_at DESC`.

Typical prompts: "Who are my primary people?" → `?type=primary`. "Who haven't I set a connection type on yet?" → `?type=unset`.

---

## Primary flows (worked end-to-end)

### Flow A — Add a moment for a contact

**Caller request:** "Sam likes pineapple pizza."

**Step 1. Search for the person.**
```bash
curl -s "https://app.nexoprm.com/api/agent/people?q=sam" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

Branch on match count:
- **1 match** → use `people[0].id` and proceed.
- **0 matches** → return: "I don't have a Sam yet. Want me to create a new contact and log the moment?" (caller decides).
- **2+ matches** → list candidates with ids and distinguishing info; return for caller to disambiguate.

**Step 2. Log the moment.**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/moments" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"person_id":"42","content":"Sam likes pineapple pizza."}'
```

Response (201):
```json
{ "moment": { "id": "812", "person_id": "42", "content": "...", "created_at": "..." }, "ai_analysis_queued": true }
```

**Step 3. Report back:** "Logged moment #812 on Sam Rivera (#42). AI analysis queued."

**Combined moment + thing-to-remember.** When $ARGUMENTS asks for both (caller did the pre-flight and got a yes), POST the moment first, then POST `/things-to-remember` with `{ person_id, content }` and report both ids.

---

### Flow B — Address (or contact info) update with spouse check

**Caller request:** "Update Sarah Chen's address to 123 Main St."

**If $ARGUMENTS asks for a read first** (caller is doing pre-flight): fetch `GET /people/{id}` and return the relevant slice (current address, connection_groups with members + roles). Caller will follow up with the write.

**If $ARGUMENTS asks for the write directly** (caller already pre-flighted): just `PATCH /people/{id}` with the new address. If $ARGUMENTS includes spouse-also-update, do both PATCHes and report both.

**Detecting spouse from the read.** In `GET /people/{id}`, look at:
- `connection_groups[].members` — any member with `role` ∈ `{spouse, partner, husband, wife}`, or
- A group whose `name` looks like a couple ("Sarah & John", "The Smiths").

Return the candidate spouse id + name to the caller.

---

### Flow C — Create a new person (with duplicate check)

**Caller request:** "Add Tom Reynolds (tom@example.com) as a contact."

**If $ARGUMENTS asks for a duplicate check first**: search by name AND by email/phone, return all near-matches with ids. Caller decides whether to create or update.

**If $ARGUMENTS asks for the create directly**: `POST /people` with the provided fields. Report `Created Tom Reynolds (#NN).`

Name-variant matching: be generous on the search side. `q=tom` will catch "Tom" and "Thomas". For typos like "Synder"/"Snyder", a substring search may miss one; fall back to a second search with the alt spelling if the caller flagged a likely typo.

---

### Flow D — Link two people (connection group)

**Caller request:** "Link Sam to John" / "Link my sister's husband to her" / "Link Eli's friend Jake".

**Step 1. Resolve both people** via `GET /people?q=...` for each. Disambiguate per Flow A.

**Step 2. Find an existing group or create one.**
```bash
curl -s "https://app.nexoprm.com/api/agent/connection-groups" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER"
```

Scan for a group that already contains one of them or obviously fits.

**If a group fits, add the missing member:**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups/42/members" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" \
  -d '{"person_id":"88","role":"spouse"}'
```

**If no group fits, create one and add both:**
```bash
curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups" \
  -H "Authorization: Bearer $NEXO_API_KEY" -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" -d '{"name":"Sam & John"}'

curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups/57/members" \
  -H "Authorization: Bearer $NEXO_API_KEY" -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" -d '{"person_id":"42","role":"spouse"}'

curl -s -X POST "https://app.nexoprm.com/api/agent/connection-groups/57/members" \
  -H "Authorization: Bearer $NEXO_API_KEY" -H "X-Nexo-User: $NEXO_USER" \
  -H "Content-Type: application/json" -d '{"person_id":"88","role":"spouse"}'
```

**Role hints:** "her husband" / "his wife" → `"spouse"`. "Eli's friend" → leave `role` null. "my sister's son" → `"child"` or `"nephew"` depending on context. When in doubt, leave null.

Report: "Added John (#88) to Sam & John group (#57) as spouse."

---

## Other common operations (quick reference)

- **"What do I know about Sarah?"** → `GET /people?q=sarah` → `GET /people/{id}` (returns moments, things-to-remember, reminders, lists, groups, relationships, articles, ai_summary in one call).
- **Look up a birthday:** `GET /people?q=...` → `GET /people/{id}` → scan `important_dates`.
- **Add a durable fact about someone:** resolve id → `POST /things-to-remember` with `{ person_id, content }`.
- **Set/update a member's role in a group:** `PATCH /connection-groups/{groupId}/members/{personId}` with `{ "role": "spouse" }` or `{ "role": null }` to clear.
- **Create a manual reminder for a person:** `POST /ai-reminders` with `{ "due_at": "2026-04-25T17:00:00Z", "message": "Check in with Sarah", "notes": "Ask about her dad's recovery", "person_id": "42" }`.
- **Update a reminder's due date or message:** `PATCH /ai-reminders/{id}` with any subset of writable fields.
- **Mark a reminder handled:** `GET /ai-reminders?status=new` → `PATCH /ai-reminders/{id}` with `{ "status": "done" }`.
- **Delete anything:** append `?confirm=true`. Only after explicit intent.
- **Dry-run a write** (validate without persisting): add `-H "X-Nexo-Dry-Run: true"` to any POST/PATCH/DELETE.
