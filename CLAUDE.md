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
- **Standard Claude Code tools** — Read/Glob/Grep/Bash/etc. via the `claude_code` preset. Available for any task that calls for them — codebase work, shell commands, research, etc.

Additional skills will likely land here over time (calendar, email, etc.). When they do, list them in this section.

## Commands

- `npm run dev` — run the agent locally with `tsx` and `.env` loaded. No build step; TypeScript runs directly.
- `npm start` — start under pm2 using `ecosystem.config.cjs`.
- `npm run restart` — runs `scripts/restart.sh`: runs `cleanup.sh` first to prune pm2 zombies / duplicates / stale entries, then `pm2 delete`s both apps (so pm2's autorestart can't fire while we're cleaning up), `pkill`s any stray `tsx` dev processes, then `pm2 start`s fresh. Self-heals from most pm2 state mess. Use this instead of `pm2 restart` alone; the agent must be single-instance and a plain restart can double-start it.
- `npm run stop` / `npm run logs` / `npm run status` — pm2 passthroughs.
- `npm run reset-session` — deletes `.session-id` and restarts. Use when the agent's accumulated Telegram conversation context has gone stale or wrong.
- `npm run cleanup` — runs `scripts/cleanup.sh`: treats `ecosystem.config.cjs` as the source of truth for pm2 and prunes anything that doesn't belong. Deletes pm2 apps whose name isn't in the ecosystem file (catches renamed zombies — e.g. `telegram-bot` after a rename to `nexo-agent`), and deletes extra entries past the oldest for apps that are. No restart, keeps the survivors running.

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

## Interpreting short commands from the user

When I say a single word like "restart", "logs", "reset", "status" etc., first check `package.json` scripts — it's almost always a reference to one of those. If there's no obvious match or multiple plausible ones, ask before acting.

**"Restart" (and anything around that word — "restart again", "bounce it", "reboot nexo", "kick the bot", etc.) always means run `npm run restart`.** Don't treat a repeat "restart" as redundant conversation; re-run the command. The restart script is idempotent and safe to run back-to-back.

When I ask you to run a command, state the exact command you're about to run **before** invoking it, so I can catch a misinterpretation before it executes.

## Runtime constraints worth knowing

- **Single-instance only.** `ecosystem.config.cjs` pins `instances: 1, exec_mode: 'fork'`, and `npm run restart` `pkill`s stray `tsx` processes first. Two agents polling the same `getUpdates` offset will duplicate replies and fight over `.session-id`.
- **ESM project** (`"type": "module"`). Imports use explicit relative paths without `.js` extensions — `tsx` handles the resolution.
- **`.env` is loaded by `tsx --env-file=.env`**, not `dotenv`. Don't add a `dotenv` import.
- **`.session-id` is state, not config.** Deleting it resets the agent's memory of prior Telegram turns. It's gitignored for that reason.
