---
name: nexo-people
description: Use for person-attached data in NexoPRM — people, moments (timestamped observations), things-to-remember (durable facts), AI reminders (when attached to a person), relationships, connection groups (the way to link people together), lists (action rosters of people), and people reports. Calls the NexoPRM Agent API at app.nexoprm.com. Triggers: "log that Sarah mentioned X", "what do I know about Alex", "Sarah's birthday", "link Sam to John", "add Sarah's address", "update Tom's phone", "remind me to text Cassie tomorrow", "Jamie prefers texting", "who haven't I categorized yet", "add Tom as a contact". The skill body has smart-behavior playbooks for common cases — spouse-aware address/contact updates, duplicate-checked person creation, household-group nudge on spouse links, moment→thing-to-remember offer.
---

# NexoPRM Agent API — People

Personal-relationship-manager API, person-attached subset. Every request uses a god-mode bearer token plus a per-user impersonation header. For non-person resources (working notes, groceries, home items, meals, food log, stash, projects, briefing/debrief), use the `nexo-prm` skill instead.

**Full API reference (source of truth):** https://app.nexoprm.com/agentapi/llm.md — fetch this if an endpoint or field shape isn't covered below, or if a call 404s / rejects unexpectedly.

## Auth

Read from env:
- `NEXO_API_KEY` — bearer token
- `NEXO_USER` — email or numeric id of the user to impersonate

Required headers on most endpoints:
- `Authorization: Bearer $NEXO_API_KEY`
- `X-Nexo-User: $NEXO_USER`
- `Content-Type: application/json` on writes

Optional: `X-Nexo-Dry-Run: true` to validate a write without persisting.

Base URL: `https://app.nexoprm.com`

## Safety rules

1. **Every `DELETE` must include `?confirm=true`** or the server returns `400 validation_error`. Only delete on explicit intent.
2. **Never log or echo `NEXO_API_KEY`.**
3. **Disambiguate people before writing.** When Matt refers to someone by first name/nickname:
   - Search with `GET /people?q=<name>`.
   - 0 matches → ask whether to create (see Smart behavior #3 first).
   - 1 match → proceed.
   - 2+ matches → list candidates with ids and distinguishing info (email/phone/relationship), wait for Matt to pick.
   - Never guess a person id.
4. Prefer `PATCH` over recreate; most updates are idempotent.
5. **CRITICAL: If any API endpoint fails (non-2xx), STOP and report the failure** — endpoint, method, status, response body. Don't continue attempting other operations.
6. **Always report what you wrote.** One line, with ids: *"Logged moment #812 on Sarah Chen (#42)."* / *"Added John (#88) to Sam & John group (#57) as spouse."*
7. **Show ids when listing person candidates.** Example: *"Two Sams — #42 Sam Rivera (sam@example.com), #88 Sam Okafor (+1 555-0134). Which one?"*

## Smart behaviors (read this before writing)

These are the cases that get wrong-answered too easily without thinking. Run them inline — read first, ask Matt, then write — don't skip the conversation step.

### 1. Address add/update → spouse check
Before patching `address` on a person, `GET /people/{id}` first and look at `connection_groups`. If a member has `role` ∈ `{spouse, partner, husband, wife}`, OR the group's `name` reads as a couple ("Sarah & John", "The Smiths"), ask Matt:
> "Sarah's married to John (#88). Update his address too?"
Then PATCH one or both based on his answer. Same logic for any change to a household-shared field.

### 2. Phone or email add/update → household check
Same pattern as address. Read the person + groups. If household members exist (spouse, kids, parents — any couple/family group), ask whether the contact info is shared (family number, household email) before writing. If shared → offer to PATCH all of them. Most personal phones aren't shared, but landlines and household emails often are — when in doubt, ask.

### 3. Creating a new person → duplicate check
Before `POST /people`, search by name (`q=<name>`). If a phone or email is provided, search again with that. If a likely match surfaces — exact name, name variant ("Synder"/"Snyder"), shared phone/email — show it to Matt:
> "Found Matt Synder (#20) — looks like the same person with a typo. Update that one or create a new contact?"
Don't auto-create when a near-match exists.

### 4. Spouse/partner connection group → household nudge
After linking two people via a couple group with role `"spouse"`/`"partner"`, ask whether to also create a household connection group (e.g. "Smith household") for shared `things_to_remember` and `important_dates`. Don't auto-create — ask:
> "Want me to also start a 'Smith household' group for shared dates and notes?"

### 5. Moment that implies a durable fact → TTR offer
Classify the moment content before posting. If it's a preference, allergy, dislike, important date, or other fact that's true beyond today (not just an event), ask before writing:
> "I'll log that as a moment. Also save 'Allergic to peanuts' as a thing-to-remember on Sarah?"
If yes, do both writes. Examples that are durable facts: "Sarah's allergic to peanuts", "Jamie prefers texts over calls", "Tom's birthday is March 4". Counter-examples (just events, no TTR): "Saw Sarah at the park", "Tom called about the trip".

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
- `GET /api/agent/people/{id}` — **THE endpoint for learning everything about a person in one call.** Returns `person` + `moments` (up to 100, each with `images`) + `things_to_remember` + `lists` + `connection_groups` + `relationships` (couple/family groups) + `saved_articles` + `ai_reminders` (up to 100, all statuses) + `ai_summary`. Use this for "what do I know about X" — and as the spouse/household read in smart behaviors #1 and #2.
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
Two sources: `moment` (AI-generated) and `manual` (one-offs via POST). Reminders can attach to a person and/or a project. This skill owns the endpoint; project-only reminders use the same shape.
- `GET /api/agent/ai-reminders?personId=&projectId=&status=&dueBefore=&source=&limit=&offset=` — `status` ∈ `new|done|dismissed`. `source` ∈ `moment|manual`.
- `POST /api/agent/ai-reminders` — required: `due_at`, `message`. Optional: `notes`, `person_id`, `project_id`, `category`, `rationale`, `status`. `message` is the concise headline shown everywhere; `rationale` is short "why this exists" context; `notes` is longer free-form details.
- `GET /api/agent/ai-reminders/{id}`
- `PATCH /api/agent/ai-reminders/{id}` — update any subset of `status`, `due_at`, `message`, `notes`, `person_id`, `project_id`, `rationale`. Pass `person_id: null` / `project_id: null` to detach, `notes: null` / `""` to clear.

**For relative due times** (e.g. "remind me in 10 minutes"), use `./scripts/get-time.sh "+10 minutes"` to compute the ISO UTC `due_at` — never do timezone math by hand.

### Relationships
- `GET|POST /api/agent/relationships` — POST body `{ name, notes, reminder }`.
- `GET|PATCH|DELETE /api/agent/relationships/{id}` — PATCH writable: `name`, `notes`, `reminder`.
- `POST /api/agent/relationships/{id}/members` — `{ person_id }`.
- `DELETE /api/agent/relationships/{id}/members/{personId}?confirm=true`

### Connection groups
The **only** way to link people together (couples, families, teams, friend circles). When Matt says "link Sam to John" or "link Eli's friend Jake", find an existing group or create one and add both members. Each member can carry an optional `role` ("spouse", "child", "parent", "sibling", etc.).

**Groups vs Lists** — both collect people but solve different jobs. Use a **group** when the collection has shared memory: shared `things_to_remember`, shared `important_dates`, or per-member `role`. Families, couples, and teams belong here. Use a **list** only for pure action rosters (scanning/filtering). Quick test: "If I could attach one shared note to this whole collection, would that make sense?" Yes → group. No → list.

**Two different concepts:**
- `person.relationship.label` — "Who is Sam to Matt?" (e.g. "sister", "best friend", "boss")
- `connection_group_members.role` — "Who is Sam within **this** group?" (e.g. "spouse" in her couple group, "sibling" in the family group)

Set `role` when phrasing gives a semantic hint ("link my sister's husband to her" → add him with `role: "spouse"`). Leave it `null` when ambiguous — the group's name carries context.

**Member payloads are enriched.** `GET /connection-groups/{id}` returns members with full Person context inlined (email, phone, address, relationship, important_dates, topics, pinned_at, last_activity_at). Usually no follow-up `/people/{id}` call needed unless you need moments / things-to-remember / AI summary.

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

## Worked flows

### Add a moment for a contact

Matt: "Sam likes pineapple pizza."

1. Search: `GET /people?q=sam`.
2. Branch on match count (see Safety rule #3).
3. Classify the content — is this a durable fact? "Likes pineapple pizza" is a preference → durable. Apply Smart behavior #5: ask whether to also save as TTR before writing.
4. Write: POST the moment, and (if Matt agreed) POST the TTR.
5. Report: *"Logged moment #812 on Sam Rivera (#42). Saved 'Likes pineapple pizza' as a thing-to-remember (#203)."*

### Update an address (with spouse check)

Matt: "Update Sarah Chen's new address: 123 Main St."

1. Resolve Sarah → `GET /people?q=sarah chen` → id.
2. Apply Smart behavior #1: `GET /people/{id}` to read connection groups.
3. If a spouse exists, ask: *"Sarah's married to John (#88). Update his address too?"*
4. PATCH one or both based on the answer.
5. Report what changed and on which records.

### Create a new person (with duplicate check)

Matt: "Add Tom Reynolds (tom@example.com) as a contact."

1. Apply Smart behavior #3: search by name AND by email. If near-matches surface, show them and ask before creating.
2. If Matt confirms create: `POST /people` with the provided fields.
3. Report: *"Created Tom Reynolds (#NN)."*

### Link two people (connection group)

Matt: "Link Sam to John" / "Link my sister's husband to her" / "Link Eli's friend Jake".

1. Resolve both via `GET /people?q=...`. Disambiguate per Safety rule #3.
2. `GET /connection-groups` to scan for an existing group that fits (already contains one of them, or is a couple/circle they belong in).
3. If a group fits → `POST /connection-groups/{id}/members` with the missing person and an appropriate role.
4. If not → `POST /connection-groups` with a sensible name, then add both as members.
5. **If the role is `"spouse"` / `"partner"`**, apply Smart behavior #4 — ask whether to also create a household group for shared things-to-remember and important_dates.
6. Report: *"Added John (#88) to Sam & John group (#57) as spouse."*

**Role hints:** "her husband" / "his wife" → `"spouse"`. "Eli's friend" → leave `role` null. "my sister's son" → `"child"` or `"nephew"` depending on context. When in doubt, leave null.

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
