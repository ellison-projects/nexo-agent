---
name: remember
description: Use when Matt wants to save a durable fact into the repo — project knowledge, his own preferences/goals, tooling notes, or anything else that belongs in git rather than NexoPRM. Triggered by phrases like "remember that X", "note that X", "save that X", "make a note X", "jot down X". For facts about a specific person (moments, things-to-remember tied to someone) defer to the `nexo-people` skill instead — those belong in PRM, not git. **Runs in a forked subagent with no conversation history.** Before invoking, the calling agent must (1) clean up the wording, (2) pick the destination using the decision tree in the skill body, (3) confirm both with Matt, then (4) invoke the skill with a fully-specified argument of the form `<cleaned fact> | <destination file path> | <heading>`, where `<heading>` is either an existing or desired heading name (e.g. `## People`) or the exact sentinel `new file` (unquoted) to create the destination. The `|` character is reserved as the field separator — it must not appear inside any field. The skill itself does the file write + commit + push and nothing else.
context: fork
---

# Remember skill

Durable-note writer for the repo. Runs in a forked subagent. By the time you're reading this, the calling agent has already talked to Matt, cleaned up the wording, picked the destination, and gotten confirmation — your job is the mechanical write + commit + push.

## Your task

`$ARGUMENTS` is a pipe-delimited string with three fields:

```
<cleaned fact sentence> | <destination file path> | <heading>
```

The `|` character is reserved as the field separator. It **must not appear inside any field** — if it does, the caller violated the contract.

`<heading>` is either an existing or desired heading in the destination file (e.g. `## People`) or the exact sentinel `new file` (lowercase, unquoted, no surrounding whitespace) meaning "create the destination file fresh."

**Parse it.**

1. Split `$ARGUMENTS` on `|`. If the split does not produce exactly three fields, or if any field is empty after trimming surrounding whitespace, stop and return an error quoting what you received and naming the problem (e.g. "got 2 fields, expected 3"; "field 2 is empty").
2. Check the destination path is a plain repo-relative path (no `..`, no absolute path outside the working tree). If not, stop and return an error.

**Validate the destination against the decision tree below.** If it's clearly mis-routed (e.g. a preference about a PRM-tracked person being written to a project doc), stop and return an error naming the mismatch. The caller can re-invoke with a corrected destination.

**Then:**

1. Decide create-vs-append based on the heading sentinel and filesystem state:
   - If heading is the sentinel `new file`: the destination file **must not already exist**. Use `Write` to create it with an appropriate top-level heading derived from the path. If the file already exists, stop and return an error — the caller meant to append and passed the wrong heading.
   - Otherwise: the destination file **must already exist**. Open it with `Edit` and append under the given heading, creating the heading within the file if it's missing. If the file does not exist, stop and return an error naming the missing path — do not guess whether to create it.
   Preserve existing formatting; append-only; never rewrite unrelated content.
2. If a very similar fact already exists in the file, stop and return a note saying so — don't dedupe silently.
3. `git add <file> && git commit -m "remember: <one-line summary>"`. Commit summaries are always a single line; keep them specific (`remember: Alan leads Declassified project` beats `remember: add note`).
4. `git push -u origin <current-branch>`. Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failure. Never force-push.
5. Return one line: what was saved, where, the commit hash. Example: `Saved to docs/projects/declassified.md and committed (a1b2c3d). Pushed.`

Caller-supplied argument: $ARGUMENTS

## Decision tree (caller reference; also used here to validate args)

Walk this top-to-bottom and stop at the first match:

1. **About a tracked person and the fact is personal/relational** → `nexo-people` skill, not this skill. If you see args pointing here for a case like this, return an error.
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
