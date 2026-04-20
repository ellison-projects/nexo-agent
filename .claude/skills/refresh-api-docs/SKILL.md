---
name: refresh-api-docs
description: Use when Matt wants to pull a fresh copy of the NexoPRM Agent API docs into the repo and see what changed. Fetches the canonical `llm.md` reference and the `features.md` product summary from app.nexoprm.com, writes timestamped snapshots into `docs/api-snapshots/`, updates the unsuffixed `llm.md` / `features.md` aliases, diffs against the prior snapshot, summarizes the changes, then auto-commits and pushes. Triggers: "refresh the api docs", "fetch the latest nexo api", "snapshot the api", "are the api docs current", "check for api changes", "update llm.md". Runs in a forked subagent — pass any caller notes as the argument (e.g. `force refresh`).
context: fork
---

# Refresh API docs

Pulls a fresh copy of the NexoPRM Agent API documentation into the repo so the `nexo-prm` skill (and the agent in general) is reasoning against current endpoint shapes. This skill is the canonical spec for the snapshot mechanics — filename format, source URLs, alias copies, diff, and commit/push.

## Your task

Run the refresh flow below and return a summary of what changed. If `$ARGUMENTS` contains "force" or similar, bypass the "skip if fresher than ~1 hour" rule; otherwise follow the default behavior.

Caller notes: $ARGUMENTS

## When this applies

Trigger on requests like:

- "refresh the api docs" / "fetch the latest api docs"
- "snapshot the nexo api" / "snapshot llm.md"
- "are the api docs current?"
- "check what changed in the api"
- After the `nexo-prm` skill hits an unexpected 404 or `validation_error` and you suspect the API moved out from under the docs.

If Matt asks a one-off API question that the existing `docs/api-snapshots/llm.md` already answers, do **not** trigger this skill — just read the file. This skill is for refreshing, not for lookups.

## Storage

- Location: `docs/api-snapshots/` (tracked in git).
- Reference docs filename: `llm-YYYY-MM-DD-HHMMSS.md` (UTC). Example: `llm-2026-04-19-143045.md`.
- Features summary filename: `features-YYYY-MM-DD-HHMMSS.md` (same convention).
- Aliases: `docs/api-snapshots/llm.md` and `docs/api-snapshots/features.md` always point at the most recent snapshot (overwritten on every refresh). These are what the `nexo-prm` skill and other readers should consult by default.

## Flow

**Step 1. Fetch and write both snapshots in one shot.**

```bash
TIMESTAMP=$(date -u +"%Y-%m-%d-%H%M%S")
curl -sf "https://app.nexoprm.com/agentapi/llm.md" \
  -o "docs/api-snapshots/llm-${TIMESTAMP}.md"
curl -sf "https://app.nexoprm.com/api/agent/features" \
  -H "Authorization: Bearer $NEXO_API_KEY" \
  -H "X-Nexo-User: $NEXO_USER" \
  | jq -r '.content' > "docs/api-snapshots/features-${TIMESTAMP}.md"
```

Verify both files are non-empty and the `llm-*.md` looks like markdown (starts with `#` or contains an `Endpoints` heading). If either fetch failed (`curl -f` non-zero) or the body is empty/error JSON, **delete the partial file(s) and stop** — surface the error to Matt rather than committing a broken snapshot.

`/agentapi/llm.md` is public and doesn't need auth headers. `/api/agent/features` does — read `NEXO_API_KEY` and `NEXO_USER` from the env (don't echo them).

**Step 2. Update the unsuffixed aliases.**

```bash
cp "docs/api-snapshots/llm-${TIMESTAMP}.md" docs/api-snapshots/llm.md
cp "docs/api-snapshots/features-${TIMESTAMP}.md" docs/api-snapshots/features.md
```

**Step 3. Diff against the prior snapshot.** Find the most recent prior `llm-*.md` (alphabetical sort, second from the end now) and `git diff --no-index` it against the new one. Same for features. Read the diffs.

**Step 4. Summarize what changed — chief-of-staff voice, grounded in the diff.** Keep it tight:

```
API docs refreshed — <YYYY-MM-DD HH:MM UTC>
Compared to <prior timestamp> (<X hours/days ago>):

Endpoints:
- Added: POST /api/agent/foo, GET /api/agent/foo/{id}
- Removed: DELETE /api/agent/legacy-thing
- Changed: PATCH /api/agent/people/{id} now accepts `pinned_at` (was read-only)

Fields:
- moments.content max length raised to 10k (was 4k)

Features (product summary):
- New: <one-liner>

Worth your attention:
<1–2 sentences. Flag anything the `nexo-prm` skill's SKILL.md likely needs to mirror, or anything that breaks current agent behavior.>
```

If the diff is empty, say so plainly: *"No changes since `<prior timestamp>`."* Don't fabricate a summary.

**Step 5. Commit and push.**

```bash
git add docs/api-snapshots/llm-${TIMESTAMP}.md \
        docs/api-snapshots/features-${TIMESTAMP}.md \
        docs/api-snapshots/llm.md \
        docs/api-snapshots/features.md
git commit -m "api-snapshot: refresh ${TIMESTAMP}"
git push -u origin <current-branch>
```

Retry push up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failure. Never force-push. Don't include the snapshot in the same commit as unrelated changes.

If the diff was empty (no changes since prior), still commit — the new timestamped file is itself a useful "we checked, nothing changed" data point. Keep the commit message but add ` (no changes)` so future-you can scan past it.

**Step 6. Flag follow-ups.** If the diff suggests `.claude/skills/nexo-prm/SKILL.md` is now stale (e.g. an endpoint was added, removed, or its body schema changed), say so explicitly and offer to update it. Don't update it silently — that's a separate confirmed action.

## Constraints

- Read-only against the API. This skill never POSTs, PATCHes, or DELETEs anything on NexoPRM.
- Don't log or echo `NEXO_API_KEY` or `NEXO_USER`.
- Don't dedupe or rewrite older snapshots. Each is a historical record.
- Don't refresh if the most recent snapshot is fresher than ~1 hour, unless Matt explicitly says "refresh again" — say so and skip the fetch.
- The unsuffixed `llm.md` / `features.md` are aliases only. Never edit them by hand; they get overwritten on the next refresh.
