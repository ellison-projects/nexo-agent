---
name: briefing
description: Use when Matt wants a generic briefing without a clear forward-looking or backward-looking intent — the catch-all. Fetches the briefing endpoint, writes a timestamped snapshot to `public/briefings/`, and reviews progress since the prior snapshot (completed, new, still open). Also the canonical spec for snapshot mechanics — the `look-ahead` and `look-back` skills reference it. For "what's next / plan my day" framing use `look-ahead`. For "what got done / review my week" use `look-back`. Examples: "brief me", "daily briefing", "give me a briefing", "catch me up". Runs in a forked subagent — pass any user focus/emphasis as the argument if relevant.
context: fork
---

# Briefing skill

Generic catch-all briefing. Chief-of-staff-style review, grounded in NexoPRM's briefing endpoint. For a quick todos-only rollup without snapshotting, the `nexo-prm` skill's "debrief" flow is the right tool instead. For forward-looking decision framing, use `look-ahead`. For retrospective "what got done" framing, use `look-back`.

## Your task

Run the full briefing flow below and return the review to the caller. If `$ARGUMENTS` is non-empty, treat it as user-supplied emphasis or focus (e.g. "focus on home items", "skip groceries") and adapt the review accordingly; otherwise produce the standard review.

Caller-supplied focus: $ARGUMENTS

This file also holds the canonical snapshot-mechanics spec (storage, filename, error handling) that the sibling skills reference. If you change the storage rules, change them here.

## Snapshot storage

- Location: `public/briefings/` at the repo root (working dir). Stored in public so they're web-accessible via the nexo-web server. Tracked in git so snapshot history is durable across machines.
- Filename: `YYYY-MM-DDTHHMMSSZ.json` in UTC. Alphabetically sortable. Example: `2026-04-18T143045Z.json`.
- Content: the raw JSON body from `GET /api/agent/briefing`. No wrapping, no transformation.
- Create `public/briefings/` if it doesn't exist.

## Commit and push (canonical — siblings reference this)

After writing a valid snapshot (and never if the fetch errored / file was deleted), commit and push it so the snapshot history stays durable across machines:

```bash
git add public/briefings/<filename>.json
git commit -m "briefing: snapshot <timestamp>"
git push -u origin <current-branch>
```

Retry push up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failure. Never force-push. Don't include the snapshot in the same commit as unrelated changes.

## Fresh briefing flow

**Step 1. Fetch and snapshot in one shot.**

```bash
mkdir -p public/briefings
ts=$(date -u +%Y-%m-%dT%H%M%SZ)
curl -s "https://app.nexoprm.com/api/agent/briefing" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -o "public/briefings/$ts.json"
```

Verify the file is valid JSON and non-empty before proceeding. If the API errored, the file will contain `{"error":...,"code":...}` — surface that to the user and stop; don't keep a broken snapshot around (delete it).

**Step 2. Find the prior snapshot.** List `public/briefings/` sorted; the prior snapshot is the second-to-latest entry (the latest is the one you just wrote). If none exists, this is the first briefing — skip the diff and just present a summary of what's currently open.

**Step 3. Diff.** Compare by `id` within these fields (the briefing only shows *open* items, so an id disappearing means completed or dismissed):

- `home_items[]`
- `grocery_items[]`
- `working_note_reminders[]` and `working_notes[].items[]` (checked items)
- `ai_reminders.overdue[]`, `ai_reminders.upcoming[]`

For each field: ids in prior but not current → **completed** (or dismissed). Ids in current but not prior → **new**. Ids in both → **still open**. For working-note items, also count a previously-unchecked item now marked `checked: true` as completed.

**Step 4. Review — chief-of-staff voice.** Format:

```
Briefing — <timestamp of this snapshot>
Since last briefing (<prior timestamp>, <X hours/days ago>):

Completed:
- #124 Replace smoke alarm batteries  (home)
- #905 Call the plumber  (plan)

New:
- #3050 eggs  (groceries)

Still open (N):
- #131 Regrout shower  (home) — open since <first-seen timestamp>
- ...

Stuck — open ≥ 3 briefings:
- #131 Regrout shower  (5 briefings)

Worth your attention:
<1–3 sentences of advisory nudges grounded in the data. Prioritize overdue AI reminders, stuck items, upcoming important dates within a week, or anything that looks like it's blocking something else.>
```

**Notes on the review:**

- Keep the prose section to 1–3 sentences. Matt wants advice, not a lecture.
- Compute "open since" and "stuck" counts by scanning backward through snapshots until the id first appears.
- Omit any section with zero entries. If everything is empty, say: *"Nothing open. You're clear."*
- If the user's goals or priorities would sharpen the advice, read `docs/matt/goals.md` or `docs/matt/preferences.md` before writing the "Worth your attention" line.
- Never invent items, ids, or status changes. If the diff is ambiguous (e.g. id vanished — completed or dismissed?), say so.

## Voice and constraints

- Chief-of-staff, not cheerleader. Observant, direct, calm. "That's been open five briefings — worth a decision: do it, delegate it, or drop it?" beats "Wow, you've made so much progress!"
- Don't suggest actions that aren't grounded in the briefing data.
- Don't write to NexoPRM from this skill. Read-only. If Matt wants to check something off or add an item in response, the `nexo-prm` skill handles non-person writes and `nexo-people` handles person-attached writes.
- Don't log or echo `NEXO_API_KEY`.
