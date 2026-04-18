# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Nexo** — a personal assistant agent with access to my custom NexoPRM platform (via the `nexo-prm` skill). Telegram is the current UI: messages in, agent replies out. Under the hood each message becomes a `query()` call to the Claude Agent SDK, and the returned result is edited back into a placeholder message the bot posted.

## Capabilities

The agent currently has:

- **`nexo-prm` skill** (`.claude/skills/nexo-prm/`) — reads/writes my personal life data via the NexoPRM Agent API at `app.nexoprm.com`. Covers people, moments, things to remember, AI reminders, lists, connection groups, linked people, working notes / plans, areas of focus, meals, food log, groceries, and home items.
- **Briefing endpoint** (`GET /api/agent/briefing`) — a one-call read-only roll-up of my open todos, plan items, reminders, recent moments, pinned people, etc. The agent should reach for this when I ask for situational awareness ("debrief me", "what's going on", "what's on my plate") rather than stitching it together from individual endpoints. Not pre-fetched — the agent decides when to call it.
- **Standard Claude Code tools** — Read/Glob/Grep/Bash/etc. via the `claude_code` preset. Available for any task that calls for them — codebase work, shell commands, research, etc.

Additional skills will likely land here over time (calendar, email, etc.). When they do, list them in this section.

## Commands

- `npm run dev` — run the agent locally with `tsx` and `.env` loaded. No build step; TypeScript runs directly.
- `npm start` — start under pm2 using `ecosystem.config.cjs`.
- `npm run restart` — kills any lingering `tsx src/index.ts` processes, then `pm2 restart nexo-agent`. Use this instead of `pm2 restart` alone; duplicated processes have happened before and the agent must be single-instance.
- `npm run stop` / `npm run logs` / `npm run status` — pm2 passthroughs.
- `npm run reset-session` — deletes `.session-id` and restarts. Use when the agent's accumulated Telegram conversation context has gone stale or wrong.

There is no test suite, linter, or typecheck script. `tsconfig.json` is `noEmit: true` — types are checked by the editor, not in CI.

## Architecture

Four small files, each a single responsibility:

- `src/index.ts` — long-poll loop. On startup, `skipBacklog()` advances the offset past queued updates so the agent doesn't replay missed messages. For each new message: post a `....` placeholder, call `askNexo`, edit the placeholder with the result (fall back to a new message if the edit fails). Filters to a single `TELEGRAM_CHAT_ID`.
- `src/telegram.ts` — thin `fetch` wrapper over the Telegram Bot API (`sendMessage`, `editMessage`, `getUpdates`, `downloadPhoto`). No SDK.
- `src/ai.ts` — wraps `@anthropic-ai/claude-agent-sdk`'s `query()`. Two things that matter:
  - **Session persistence.** The `session_id` returned on each `result` message is written to `.session-id` (gitignored) and passed as `resume` on the next call. This is what lets the agent remember prior Telegram turns across process restarts. If you change the message-handling flow, preserve this write.
  - **Agent config.** Runs with `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `cwd` from `NEXO_AGENT_CWD` env var (falls back to `process.cwd()`), and `settingSources: ['project', 'user', 'local']` — the agent reads this repo's `.claude/` config so skills and settings take effect. The system prompt lives in `SYSTEM_PROMPT` in this file and frames the agent as Nexo, my personal assistant.
- `src/env.ts` — fails fast on missing `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `NEXO_API_KEY`, `NEXO_USER`.

## Interpreting short commands from the user

When I say a single word like "restart", "logs", "reset", "status" etc., first check `package.json` scripts — it's almost always a reference to one of those. If there's no obvious match or multiple plausible ones, ask before acting.

When I ask you to run a command, state the exact command you're about to run **before** invoking it, so I can catch a misinterpretation before it executes.

## Runtime constraints worth knowing

- **Single-instance only.** `ecosystem.config.cjs` pins `instances: 1, exec_mode: 'fork'`, and `npm run restart` `pkill`s stray `tsx` processes first. Two agents polling the same `getUpdates` offset will duplicate replies and fight over `.session-id`.
- **ESM project** (`"type": "module"`). Imports use explicit relative paths without `.js` extensions — `tsx` handles the resolution.
- **`.env` is loaded by `tsx --env-file=.env`**, not `dotenv`. Don't add a `dotenv` import.
- **`.session-id` is state, not config.** Deleting it resets the agent's memory of prior Telegram turns. It's gitignored for that reason.
