---
name: remember
description: Use when Matt wants to save a durable fact into the repo — project knowledge, his own preferences/goals, tooling notes, or anything else that belongs in git rather than NexoPRM. Triggered by phrases like "remember that X", "note that X", "save that X", "make a note X", "jot down X". Routes the fact to the right file under `docs/`, confirms wording and destination with Matt, writes it, commits, and pushes. For facts about a specific person (moments, things-to-remember tied to someone) defer to the `nexo-prm` skill instead — those belong in PRM, not git.
---

# Remember skill

Turn a casual "remember X" into a durable, committed note in the right place in the repo.

## When this skill applies (vs. nexo-prm)

**Use this skill** for facts that belong in the codebase / documentation:
- Project knowledge — "remember the lead of Declassified is Alan"
- Matt-about-Matt — "remember I prefer short replies", "remember my goal this quarter is X"
- Tooling / agent behavior — "remember to always run `npm run restart` not `pm2 restart`"
- General facts about the world worth keeping alongside the repo

**Defer to `nexo-prm`** when the fact is *about a specific person you already track in PRM*:
- "remember Sarah prefers texting" → PRM moment on Sarah
- "remember Alex's birthday is June 3" → PRM important date
- If the fact is about a person but the person isn't in PRM and the context is a project (like "Alan leads Declassified"), the project-doc route in this skill is fine.

**Ambiguous?** Ask Matt which he wants before routing.

## Decision tree — where does the fact go?

Walk this top-to-bottom and stop at the first match:

1. **About a tracked person and the fact is personal/relational** → `nexo-prm` skill, exit.
2. **About a project or work context** → `docs/projects/<project-slug>.md`.
   - Slugify the project name: lowercase, dashes (e.g. "Declassified" → `declassified`, "Nexo PRM" → `nexo-prm`).
   - Create the file if it doesn't exist. Start with an `# <Project Name>` heading.
   - Append under a sensible heading (e.g. `## People`, `## Context`, `## Decisions`). Create the heading if missing.
3. **About Matt himself** → append to the most specific `docs/matt/*.md`:
   - Goals, priorities, what he's working toward → `docs/matt/goals.md`
   - How he wants to be communicated with, formatting, tone, working style → `docs/matt/preferences.md`
   - Bio, identity, background, life context → `docs/matt/about.md`
4. **About how the agent / repo / tooling should behave** → `CLAUDE.md`.
   - Only when it's a genuinely durable instruction. One-off preferences belong in `docs/matt/preferences.md`.
5. **None of the above** → `docs/memory.md` (create if missing). Fallback bucket; each entry a bullet with a date prefix like `- 2026-04-19: <fact>`.

## Flow

**Step 1. Parse the fact.** Strip the trigger phrase. Rewrite into a clean, complete sentence — don't parrot casual phrasing. "remember alan runs declassified" → "Alan is the lead of the Declassified project."

**Step 2. Pick the destination** using the decision tree. If it's step 1 (person in PRM), hand off to the `nexo-prm` skill and stop.

**Step 3. Confirm with Matt before writing.** Show him:
- The cleaned-up sentence you'll write
- The exact file path
- The heading / section you'll append under (or that you'll create the file)

Example:
> I'll save this to `docs/projects/declassified.md` under `## People`:
>
> > Alan is the lead of the Declassified project.
>
> Create the file and add it? (Or route it somewhere else?)

If the destination is obvious and unambiguous (e.g. Matt explicitly said "add to my preferences"), you can skip confirmation and just note what you did.

**Step 4. Write.** Use `Edit` to append to an existing file, `Write` only to create a new one. Preserve existing formatting.

**Step 5. Commit and push.**

```bash
git add <file>
git commit -m "remember: <one-line summary of the fact>"
git push -u origin <current-branch>
```

Use a HEREDOC for the commit message if it's multi-line. Commit summary should be specific: `remember: Alan leads Declassified project` beats `remember: add note`.

Retry push up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network failure. Never force-push.

**Step 6. Report back.** One line: what was saved, where, and the commit hash. Example:
> Saved to `docs/projects/declassified.md` and committed (`a1b2c3d`). Pushed.

## Constraints

- Always confirm destination + wording before writing, unless Matt was explicit about where it goes.
- Don't dedupe silently — if a similar fact already exists in the target file, flag it and ask whether to replace, append, or skip.
- Don't reformat unrelated content in the target file. Append-only discipline.
- Don't commit secrets. If the fact Matt asked you to remember contains a credential, refuse and suggest env vars instead.
- One fact per invocation by default. If Matt gives a list, confirm whether they all go to the same place or should be split.
