---
name: look-ahead
description: Use when Matt wants a forward-looking briefing — decision-first, "what needs attention next." Focuses on overdue AI reminders, upcoming important dates in the next 7 days, flagged plan items, and anything time-sensitive. Fetches and snapshots the briefing (shared mechanics with the `briefing` skill), but the review is oriented toward what to do next, not what's happened. Triggers: "look ahead", "what's coming up", "what's next", "what needs my attention", "what should I focus on", "morning briefing", "plan my day", "prep me for the day/week". Runs in a forked subagent — pass any user focus as the argument if relevant.
context: fork
---

# Look-ahead briefing

Forward-looking review. Decision-first framing: what's time-sensitive, what needs a call today, what's on the horizon.

## Your task

Run the look-ahead flow below and return the review to the caller. If `$ARGUMENTS` is non-empty, treat it as user-supplied emphasis or focus (e.g. "focus on work this week", "prep me for Friday"); otherwise produce the standard output.

Caller-supplied focus: $ARGUMENTS

## Fetch + snapshot

Same mechanics as the `briefing` skill — see `.claude/skills/briefing/SKILL.md` for the full spec (filename format, error handling, storage in `public/briefings/`, **and the commit-and-push step**). Fetch `GET /api/agent/briefing`, write the raw response to `public/briefings/YYYY-MM-DDTHHMMSSZ.json`, then commit and push per the canonical spec. Do not duplicate or re-describe the snapshot mechanics here.

Every look-ahead fetches fresh — the point is a current read on what's coming.

## What this skill emphasizes

Prioritize these briefing fields (top of output first):

1. `ai_reminders.overdue[]` — always lead with these if any exist.
2. `upcoming_important_dates[]` — filter to next 7 days.
3. `ai_reminders.upcoming[]` — filter to next 7 days if a `due_at` is present.
4. `working_note_reminders[]` — plan items flagged due or overdue.
5. New items since the prior snapshot — only if they're plausibly time-sensitive.

De-emphasize or omit: `recent_moments`, `food_log`, `stale_people`, `pillars`, `goals`, closed items. Those belong in `look-back`. Skip unless they sharpen a time-sensitive call.

## Output shape

```
Look-ahead — <timestamp of this snapshot>

Headline: <one sentence, state-of-play for today and the next few days>

Do this first:
<a single item. The most time-sensitive or highest-leverage thing. Be specific about why.>

Time-sensitive (next 7d):
- <YYYY-MM-DD> — <item>  (#<id>)

Overdue reminders:
- #<id> <description>  (<how overdue>)

Watch items:
- <items that aren't urgent yet but will be within the window, or stuck items that risk becoming urgent>

Worth your attention:
<1–2 sentences. Advisory framing. What the data is telling you to watch, decide, or drop.>
```

Section rules:
- Cap each section at 5 items. If there are more, end with `+N more`.
- Omit empty sections.
- If nothing is time-sensitive and nothing is overdue, say so plainly: *"Nothing pressing in the next 7 days. Use the space."*

## Voice

Calm chief-of-staff walking you through the day before it starts. Directive, not alarmist. "Here's what's in front of you — this is the one I'd do first." No cheerfulness, no scolding, no filler.

Read `docs/matt/goals.md` or `docs/matt/preferences.md` if it would sharpen the "do this first" call. Don't read them by default.

## Constraints

- Read-only. Don't write to NexoPRM from this skill. If Matt wants to act on an item, the `nexo-prm` skill handles the write.
- Don't call other NexoPRM endpoints. The briefing response is the single source.
- Don't invent urgency. If the data doesn't justify "do this first," say there's no clear priority today.
- Don't log or echo `NEXO_API_KEY`.
