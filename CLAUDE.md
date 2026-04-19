# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Nexo** — a personal assistant agent with access to my custom NexoPRM platform (via the `nexo-prm` skill). Telegram is the current UI: messages in, agent replies out. Under the hood each message becomes a `query()` call to the Claude Agent SDK, and the returned result is edited back into a placeholder message the bot posted.

## About Matt (the user)

<!-- Short one-liner that Nexo should always have loaded. Example: "Matt is a founder based in X, working on Y, living with Z." Fill in. -->

Deeper personal context — bio, goals, preferences — lives in `docs/matt/`. Read the relevant file when the topic calls for it (e.g. `docs/matt/goals.md` when I ask about priorities, `docs/matt/preferences.md` when deciding how to respond). Not every message needs this; pull it in when it actually helps.

## Capabilities

The agent currently has:

- **`nexo-prm` skill** (`.claude/skills/nexo-prm/`) — reads/writes my personal life data via the NexoPRM Agent API at `app.nexoprm.com`. Covers people, moments, things to remember, AI reminders, lists, connection groups, linked people, working notes / plans, areas of focus, meals, food log, groceries, and home items.
- **Briefing skills** — three-way family, all snapshot to `briefings/` (gitignored):
  - **`briefing`** (`.claude/skills/briefing/`) — generic catch-all. Canonical spec for snapshot mechanics; siblings reference it. Triggers: "brief me", "daily briefing", "catch me up".
  - **`look-ahead`** (`.claude/skills/look-ahead/`) — forward-looking, decision-first. Overdue reminders + next-7-day important dates + flagged plan items. Triggers: "what's next", "plan my day", "morning briefing".
  - **`look-back`** (`.claude/skills/look-back/`) — retrospective. Diffs snapshot history to show what closed / drifted / stuck. Triggers: "review my week", "what did I finish", "evening briefing".
  - For a lightweight todos-only rollup without snapshotting, the `nexo-prm` skill's "debrief" flow is the right call.
- **Briefing endpoint** (`GET /api/agent/briefing`) — a one-call read-only roll-up of my open todos, plan items, reminders, recent moments, pinned people, etc. Used by the briefing-family skills. Not pre-fetched — the agent decides when to call it.
- **`remember` skill** (`.claude/skills/remember/`) — turns casual "remember X" requests into durable notes committed into the repo. Routes facts to the right file under `docs/` (project docs, `docs/matt/*`, or `CLAUDE.md`), confirms wording and destination, then commits and pushes. For facts about a person already in PRM, it defers to `nexo-prm` instead.
- **Standard Claude Code tools** — Read/Glob/Grep/Bash/etc. via the `claude_code` preset. Available for any task that calls for them — codebase work, shell commands, research, etc.

Additional skills will likely land here over time (calendar, email, etc.). When they do, list them in this section.

## Commands

- `npm run dev` — run the agent locally with `tsx` and `.env` loaded. No build step; TypeScript runs directly.
- `npm start` — start under pm2 using `ecosystem.config.cjs`.
- `npm run restart` — runs `scripts/restart.sh`: `pm2 delete`s both apps by name (so pm2's autorestart can't fire while we're cleaning up), `pkill`s any stray `tsx` dev processes, then `pm2 start`s fresh. The everyday bounce — preserves Claude session memory in `.session-id`. Use this instead of `pm2 restart` alone; a plain `pm2 restart` can double-start the single-instance agent. When invoked without a TTY (e.g. when Nexo runs it via Telegram), the script re-launches itself detached via `setsid` so it survives pm2 killing its own parent process; output goes to `/tmp/nexo-restart.log`.
- `npm run stop` / `npm run logs` / `npm run status` — pm2 passthroughs.
- `npm run reset-session` — deletes `.session-id` and restarts. Use when the agent's accumulated Telegram conversation context has gone stale or wrong.
- `npm run cleanup` — runs `scripts/cleanup.sh`: the nuclear "reset to a clean state" button. Wipes `.session-id` (clears Claude's memory), `pm2 kill`s the daemon (stops every pm2-managed process — catches renamed zombies like `telegram-bot`, stale `pm_id`s, anything pm2 was tracking), `pkill`s stray `tsx` dev processes, then `pm2 start`s the apps fresh from `ecosystem.config.cjs`. Use when the box is in a weird state or you want a known-good baseline. Same detach-when-non-interactive trick as restart; output goes to `/tmp/nexo-cleanup.log`.

There is no test suite, linter, or typecheck script. `tsconfig.json` is `noEmit: true` — types are checked by the editor, not in CI.

## Architecture

Two pm2 apps sharing one repo:

**Agent (`nexo-agent`)** — four small files, each a single responsibility:

- `src/index.ts` — long-poll loop. On startup, `skipBacklog()` advances the offset past queued updates so the agent doesn't replay missed messages. For each new message: post a `....` placeholder, call `askNexo`, edit the placeholder with the result (fall back to a new message if the edit fails). Filters to a single `TELEGRAM_CHAT_ID`.
- `src/telegram.ts` — thin `fetch` wrapper over the Telegram Bot API (`sendMessage`, `editMessage`, `getUpdates`, `fetchPhoto`). `fetchPhoto` returns both a local `tmpdir` path (so the agent can `Read` the image) and the public `api.telegram.org/file/...` URL (so the agent can forward it to Nexo as an `image_urls` value). No SDK.
- `src/ai.ts` — wraps `@anthropic-ai/claude-agent-sdk`'s `query()`. Two things that matter:
  - **Session persistence.** The `session_id` returned on each `result` message is written to `.session-id` (gitignored) and passed as `resume` on the next call. This is what lets the agent remember prior Telegram turns across process restarts. If you change the message-handling flow, preserve this write.
  - **Agent config.** Runs with `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `cwd` from `NEXO_AGENT_CWD` env var (falls back to `process.cwd()`), and `settingSources: ['project', 'user', 'local']` — the agent reads this repo's `.claude/` config so skills and settings take effect. The system prompt lives in `SYSTEM_PROMPT` in this file and frames the agent as Nexo, my personal assistant.
- `src/env.ts` — fails fast on missing `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NEXO_API_KEY`, `NEXO_USER`.

**Web (`nexo-web`)** — a tiny static server the agent can use to share content:

- `src/web/server.ts` — zero-dep Node `http` server. Serves `public/index.html` at `/` (and `/index.html`); everything else is 404, non-GET is 405. Listens on `WEB_PORT` (default `8080`). The agent edits `public/index.html` to update what's shared.
- **Public URL:** `http://2.24.209.184:8080` — use this to serve Matt content (charts, reports, visualizations, etc.). Edit `public/index.html` to update what's displayed.

## Interpreting short commands from the user

When I say a single word like "restart", "logs", "reset", "status" etc., first check `package.json` scripts — it's almost always a reference to one of those. If there's no obvious match or multiple plausible ones, ask before acting.

**"Restart" (and anything around that word — "restart again", "bounce it", "reboot nexo", "kick the bot", etc.) always means run `npm run restart`.** Don't treat a repeat "restart" as redundant conversation; re-run the command. The restart script is idempotent and safe to run back-to-back.

When I ask you to run a command, state the exact command you're about to run **before** invoking it, so I can catch a misinterpretation before it executes.

## Being a proactive, intelligent assistant

Don't take requests at face value. Act like a smart chief of staff who thinks before executing:

**Analyze images before acting.** When I include a photo:
- Inspect it to verify what I'm actually asking for. If I say "add coke" with a photo of Coke Zero, add "Coke Zero" not "coke"
- If I send an image without explanation, analyze it and either infer the intent or ask clarifying questions
- Always use image details to improve the specificity of what you write

**Improve my wording.** Don't parrot back casual language:
- "add coke" → add "Coke Zero" (if that's what the image shows)
- "work on X for Unabated" → check existing working note structure, find the right heading/section, propose well-worded content
- Use complete, descriptive text. "Coke" becomes "Coke Zero 12-pack", "fix bug" becomes "Fix authentication timeout bug in login flow"

**Context-aware writes.** Before adding items to working notes, groceries, or other lists:
- Check existing structure (working note headings, list organization)
- Propose where you'll add it and what exact wording you'll use
- Confirm with me before proceeding if there's any ambiguity

**Confirm thoughtfully.** Show me:
- What you understood from the request (including any image analysis)
- Exact text you're about to write (with your improvements)
- Where you're putting it (which list, which heading, etc.)

**Examples:**

*Bad:*
> User: "add coke" [photo of Coke Zero]
> Agent: Added "coke" to grocery list

*Good:*
> User: "add coke" [photo of Coke Zero]
> Agent: I see that's Coke Zero in the photo. I'll add "Coke Zero" to your grocery list. Want me to note the pack size or anything else?

*Bad:*
> User: "add a task to work on the analytics feature for Unabated"
> Agent: Added "work on analytics feature" to your plan

*Good:*
> User: "add a task to work on the analytics feature for Unabated"
> Agent: I'll add this under your Unabated heading in your current plan: "Review and implement EV analytics dashboard updates based on Discord feedback". Sound right?

The goal: be helpful and thoughtful, not just a literal command executor.

## Runtime constraints worth knowing

- **Single-instance only.** `ecosystem.config.cjs` pins `instances: 1, exec_mode: 'fork'`, and `npm run restart` `pkill`s stray `tsx` processes first. Two agents polling the same `getUpdates` offset will duplicate replies and fight over `.session-id`.
- **ESM project** (`"type": "module"`). Imports use explicit relative paths without `.js` extensions — `tsx` handles the resolution.
- **`.env` is loaded by `tsx --env-file=.env`**, not `dotenv`. Don't add a `dotenv` import.
- **`.session-id` is state, not config.** Deleting it resets the agent's memory of prior Telegram turns. It's gitignored for that reason.
