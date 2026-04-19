# API Snapshots

This directory stores timestamped snapshots of the NexoPRM Agent API documentation to track changes over time.

## Naming Convention

Each snapshot is timestamped with ISO 8601 format:

- `llm-YYYY-MM-DD-HHMMSS.md` - e.g., `llm-2026-04-18-213000.md`

The most recent snapshot should also be copied to `llm.md` (no timestamp) for easy reference.

## Creating a New Snapshot

When updating the API docs:

```bash
TIMESTAMP=$(date -u +"%Y-%m-%d-%H%M%S")
curl -s "https://app.nexoprm.com/agentapi/llm.md" > "docs/api-snapshots/llm-${TIMESTAMP}.md"
cp "docs/api-snapshots/llm-${TIMESTAMP}.md" docs/api-snapshots/llm.md
```

## Comparing Changes

To see what changed between snapshots:

```bash
# Compare two specific snapshots
diff docs/api-snapshots/llm-2026-04-18-*.md docs/api-snapshots/llm-2026-04-19-*.md

# Or use git diff
git diff docs/api-snapshots/llm-2026-04-18-*.md docs/api-snapshots/llm-2026-04-19-*.md
```

## Current Snapshots

List all snapshots:

```bash
ls -lt docs/api-snapshots/llm-*.md
```
