# API Snapshots

This directory stores timestamped snapshots of the NexoPRM Agent API documentation to track changes over time.

## Naming Convention

Each snapshot pair is timestamped with ISO 8601 format:

- `llm-YYYY-MM-DD-HHMMSS.md` - API reference docs
- `features-YYYY-MM-DD-HHMMSS.md` - product features summary

The most recent snapshots are also copied to `llm.md` and `features.md` (no timestamp) for easy reference.

## Creating a New Snapshot

When updating the API docs:

```bash
TIMESTAMP=$(date -u +"%Y-%m-%d-%H%M%S")
curl -s "https://app.nexoprm.com/agentapi/llm.md" > "docs/api-snapshots/llm-${TIMESTAMP}.md"
curl -s "https://app.nexoprm.com/api/agent/features" | jq -r '.content' > "docs/api-snapshots/features-${TIMESTAMP}.md"
yes | cp "docs/api-snapshots/llm-${TIMESTAMP}.md" docs/api-snapshots/llm.md 2>/dev/null
yes | cp "docs/api-snapshots/features-${TIMESTAMP}.md" docs/api-snapshots/features.md 2>/dev/null
```

## Comparing Changes

To see what changed between snapshots:

```bash
# Compare API reference docs
diff docs/api-snapshots/llm-2026-04-18-*.md docs/api-snapshots/llm-2026-04-19-*.md

# Compare features
diff docs/api-snapshots/features-2026-04-18-*.md docs/api-snapshots/features-2026-04-19-*.md

# Or use git diff
git diff docs/api-snapshots/llm-2026-04-18-*.md docs/api-snapshots/llm-2026-04-19-*.md
```

## Current Snapshots

List all snapshots:

```bash
ls -lt docs/api-snapshots/{llm,features}-*.md
```
