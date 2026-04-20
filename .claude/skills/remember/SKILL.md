---
name: remember
description: Use when Matt wants to save a durable fact into the repo — project knowledge, his own preferences/goals, tooling notes, or anything else that belongs in git rather than NexoPRM. Triggered by phrases like "remember that X", "note that X", "save that X", "make a note X", "jot down X". For facts about a specific person (moments, things-to-remember tied to someone) defer to the `nexo-prm` skill instead — those belong in PRM, not git. **Runs in a forked subagent with no conversation history.** Before invoking, the calling agent must (1) clean up the wording, (2) pick the destination using the decision tree in the skill body, (3) confirm both with Matt, then (4) invoke the skill with a fully-specified argument: `<cleaned fact> | <destination file path> | <heading or "new file">`. The skill itself does the file write + commit + push and nothing else.
context: fork
---

# Remember skill

Durable-note writer for the repo. Runs in a forked subagent. By the time you're reading this, the calling agent has already talked to Matt, cleaned up the wording, picked the destination, and gotten confirmation — your job is the mechanical write + commit + push.

## Your task

`$ARGUMENTS` is a pipe-delimited string:

```
<cleaned fact sentence> | <destination file path> | <heading name or the literal string "new file">
```

**Parse it.** If any field is missing or the format is obviously wrong, stop and return an error describing what you received — don't guess.

**Validate the destination against the decision tree below.** If it's clearly mis-routed (e.g. a preference about a PRM-tracked person being written to a project doc), stop and return an error naming the mismatch. The caller can re-invoke with a corrected destination.

**Then:**

1. Open the destination file with `Edit` (append under the given heading, creating the heading if missing). If the heading is `new file`, use `Write` to create the file with an appropriate top-level heading derived from the path. Preserve existing formatting; append-only.
2. If a very similar fact already exists in the file, stop and return a note saying so — don't dedupe silently.
3. `git add <file> && git commit -m "remember: <one-line summary>"`. Use HEREDOC for multi-line messages. Commit summary should be specific: `remember: Alan leads Declassified project` beats `remember: add note`.
4. `git push -u origin <current-branch>`. Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failure. Never force-push.
5. Return one line: what was saved, where, the commit hash. Example: `Saved to docs/projects/declassified.md and committed (a1b2c3d). Pushed.`

Caller-supplied argument: $ARGUMENTS

## Decision tree (caller reference; also used here to validate args)

Walk this top-to-bottom and stop at the first match:

1. **About a tracked person and the fact is personal/relational** → `nexo-prm` skill, not this skill. If you see args pointing here for a case like this, return an error.
2. **About a project or work context** → `docs/projects/<project-slug>.md`.
   - Slugify the project name: lowercase, dashes (e.g. "Declassified" → `declassified`, "Nexo PRM" → `nexo-prm`).
   - File may not exist yet — caller should pass `new file` as the heading in that case; create with an `# <Project Name>` top heading and append the fact under a first subheading.
   - Otherwise append under a sensible existing heading (e.g. `## People`, `## Context`, `## Decisions`).
3. **About Matt himself** → most specific `docs/matt/*.md`:
   - Goals, priorities, what he's working toward → `docs/matt/goals.md`
   - How he wants to be communicated with, formatting, tone, working style → `docs/matt/preferences.md`
   - Bio, identity, background, life context → `docs/matt/about.md`
4. **About how the agent / repo / tooling should behave** → `CLAUDE.md`. Only when it's genuinely durable; one-off preferences belong in `docs/matt/preferences.md`.
5. **None of the above** → `docs/memory.md` (create if missing). Fallback bucket; each entry a bullet with a date prefix like `- 2026-04-19: <fact>`.

## Constraints

- Don't commit secrets. If the fact contains anything credential-shaped (API key, password, token), refuse and return an error suggesting env vars.
- One fact per invocation. If `$ARGUMENTS` seems to contain multiple facts smashed together, return an error asking the caller to split and re-invoke.
- No conversational questions back to Matt — you can't reach him from here. Errors go to the caller, which decides whether to re-prompt.
