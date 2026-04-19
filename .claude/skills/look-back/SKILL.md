---
name: look-back
description: Use when Matt wants a retrospective briefing — what closed, what got done, what drifted. Draws primarily on the local `public/briefings/` snapshot history to diff the past against now. Useful for end-of-day wrap-ups, reflection, and weekly reviews. Triggers: "look back", "review my day/week", "how did this week go", "what did I finish", "what did I get done since Monday", "end-of-day brief", "evening briefing", "wrap up my week", "compare to yesterday's briefing".
---

# Look-back briefing

Retrospective review. Snapshot-history-first. Celebrates what closed, surfaces what drifted, notices patterns across the window.

## Fetch + snapshot

Same mechanics as the `briefing` skill — see `.claude/skills/briefing/SKILL.md` for filename format, error handling, storage location, **and the commit-and-push step**. By default, fetch `GET /api/agent/briefing`, write a snapshot so "now" is captured and future look-backs have one more data point, then commit and push it per the canonical spec.

**Skip the fetch** when the user explicitly asks for a pure-historical view (*"just compare Monday's snapshot to Wednesday's, don't fetch"*). In that case, work only from `public/briefings/` and don't write or commit anything.

## Window selection

- Default: since the most recent prior snapshot. That's your baseline.
- If Matt names a window ("this week", "since Monday", "last 3 days", "since <date>"), pick the earliest snapshot in that window as the baseline and compare against the latest (or the one just written).
- If Matt names a specific prior briefing ("compare to yesterday's 8am brief"), use that as the baseline.

If the window has no snapshots (or only the one just written), say so: *"I only have snapshots from <earliest date> onward — nothing covers that period."* Don't guess.

## What this skill emphasizes

Diff the baseline snapshot against the current one by `id` across these fields (all list what's *open*, so an id disappearing means completed or dismissed):

- `home_items[]`
- `grocery_items[]`
- `working_note_reminders[]` and checked items in `working_notes[].items[]`
- `ai_reminders.overdue[]`, `ai_reminders.upcoming[]`

Categories:

- **Finished**: ids in baseline but not in current. Also: working-note items now `checked: true` that weren't before.
- **Drifted**: ids in baseline that are *still* open now. Count how long — scan snapshots backward to find the id's first appearance (in briefings, days).
- **Patterns**: themes visible across the window. Examples: "closed 5 home items, 0 plan items"; "same reminder has slipped three briefings"; "no moments logged this week".
- **What didn't happen**: working-note reminders that were flagged at the start of the window and are still flagged now.

De-emphasize: upcoming dates, overdue reminders looking forward — those belong in `look-ahead`. Only surface them if they help explain drift.

## Output shape

```
Look-back — <window, e.g. "since <prior timestamp>, 18h ago" or "since Monday, 3 days, 4 snapshots">

Finished:
- #<id> <description>  (<category: home / plan / groceries / reminder>)

Drifted (still open):
- #<id> <description>  — open since <first-seen timestamp>, <N> briefings

Patterns:
- <1–3 observations grounded in the data>

Worth reflecting on:
<1–2 sentences. What the window seems to be saying.>
```

Section rules:
- Cap each list at 5 items; roll up the rest as `+N more`.
- Omit empty sections.
- If nothing closed and nothing drifted: *"No movement in this window."*

## Voice

Reflective, honest, calm. "You closed five home items this week — most of any window in your history." Or: "That shower regrout has been on the list for eight briefings — worth a decision: do it, delegate it, or drop it." No flattery, no scolding. Observations, not commentary.

Read `docs/matt/goals.md` if patterns need framing against longer-term priorities. Not by default.

## Constraints

- Read-only. If Matt wants to close something or add a note in response, the `nexo-prm` skill handles the write.
- Don't call other NexoPRM endpoints to enrich the view — the briefing response plus snapshot history is the full source.
- Don't manufacture patterns. If the window is too short or the snapshots too sparse to say anything confident, say that instead.
- Don't log or echo `NEXO_API_KEY`.
