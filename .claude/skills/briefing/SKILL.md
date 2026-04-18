---
name: briefing
description: Use when Matt wants a briefing — a snapshotted, chief-of-staff style review of his NexoPRM state. Fetches the briefing endpoint, writes a timestamped snapshot to `briefings/`, and reviews progress against the prior snapshot (completed, new, still open, stuck). Also handles retrospective review across prior snapshots. Examples: "brief me", "daily briefing", "morning briefing", "give me a briefing", "review my week", "what did I finish since Monday", "compare to yesterday's briefing".
---

# Briefing skill

Personal chief-of-staff-style review, grounded in NexoPRM's briefing endpoint plus a local snapshot history. Matt wants to see what he's completed, what's lingering, and what deserves attention — not just a raw todo dump. For a quick todos-only rollup without snapshotting, the `nexo-prm` skill's "debrief" flow is the right tool instead.

## Modes

- **Fresh briefing** (default): fetch live, snapshot, diff against prior snapshot, review.
- **Retrospective**: read existing snapshots to review progress across a time window.

The user's wording decides which. Don't pre-fetch.

## Snapshot storage

- Location: `briefings/` at the repo root (working dir). Gitignored — personal data.
- Filename: `YYYY-MM-DDTHHMMSSZ.json` in UTC. Alphabetically sortable. Example: `2026-04-18T143045Z.json`.
- Content: the raw JSON body from `GET /api/agent/briefing`. No wrapping, no transformation.
- Create `briefings/` if it doesn't exist.

## Fresh briefing flow

**Step 1. Fetch and snapshot in one shot.**

```bash
mkdir -p briefings
ts=$(date -u +%Y-%m-%dT%H%M%SZ)
curl -s "https://app.nexoprm.com/api/agent/briefing" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  -o "briefings/$ts.json"
```

Verify the file is valid JSON and non-empty before proceeding. If the API errored, the file will contain `{"error":...,"code":...}` — surface that to the user and stop; don't keep a broken snapshot around (delete it).

**Step 2. Find the prior snapshot.** List `briefings/` sorted; the prior snapshot is the second-to-latest entry (the latest is the one you just wrote). If none exists, this is the first briefing — skip the diff and just present a summary of what's currently open.

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

## Retrospective flow

Triggered by wording like *"what did I finish this week"*, *"compare to Monday's briefing"*, *"how's my week looking"*.

1. List `briefings/` sorted.
2. Pick the snapshot closest to the start of the requested window (earliest in range) and the latest snapshot in range (or the newest overall if the window extends to now).
3. Diff them the same way as the fresh flow.
4. If the window has no snapshots, say so: *"I only have snapshots from <date> onward — nothing covers that period."*

Do **not** fetch a fresh briefing in retrospective mode unless the user explicitly asks for one. The point is historical.

## Voice and constraints

- Chief-of-staff, not cheerleader. Observant, direct, calm. "That's been open five briefings — worth a decision: do it, delegate it, or drop it?" beats "Wow, you've made so much progress!"
- Don't suggest actions that aren't grounded in the briefing data.
- Don't write to NexoPRM from this skill. Read-only. If Matt wants to check something off or add an item in response, the `nexo-prm` skill handles the write.
- Don't log or echo `NEXO_API_KEY`.
