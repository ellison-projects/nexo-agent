# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Telegram bot that answers questions about its own codebase by delegating each message to the Claude Agent SDK. Incoming Telegram messages become `query()` prompts; the agent's final result is edited back into the placeholder message the bot posted.

## Commands

- `npm run dev` — run the bot locally with `tsx` and `.env` loaded. No build step; TypeScript runs directly.
- `npm start` — start under pm2 using `ecosystem.config.cjs`.
- `npm run restart` — kills any lingering `tsx src/index.ts` processes, then `pm2 restart telegram-bot`. Use this instead of `pm2 restart` alone; duplicated processes have happened before and the bot must be single-instance.
- `npm run stop` / `npm run logs` / `npm run status` — pm2 passthroughs.
- `npm run reset-session` — deletes `.session-id` and restarts the bot. Use when the agent's accumulated Telegram conversation context has gone stale or wrong.

There is no test suite, linter, or typecheck script. `tsconfig.json` is `noEmit: true` — types are checked by the editor, not in CI.

## Architecture

Four small files, each a single responsibility:

- `src/index.ts` — long-poll loop. On startup, calls `skipBacklog()` to advance the offset past any queued updates so the bot doesn't replay missed messages. For each new message: posts a `....` placeholder, invokes `generateFunnyReply`, and edits the placeholder with the result (falling back to a new message if the edit fails). Filters to a single `TELEGRAM_CHAT_ID`.
- `src/telegram.ts` — thin `fetch` wrapper over the Telegram Bot API (`sendMessage`, `editMessage`, `getUpdates`). No SDK.
- `src/ai.ts` — wraps `@anthropic-ai/claude-agent-sdk`'s `query()`. Two things that matter:
  - **Session persistence.** The `session_id` returned on each `result` message is written to `.session-id` (gitignored) and passed as `resume` on the next call. This is what lets the bot remember prior Telegram turns across process restarts. If you change the message-handling flow, preserve this write.
  - **Agent permissions.** Runs with `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `cwd: /root/code/nexo-agent`, and `settingSources: ['project', 'user']` — the agent reads this repo's `.claude/` config and can freely use Read/Glob/Grep. The system prompt frames it as a dev-support teammate.
- `src/env.ts` — fails fast on missing `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`.

## Runtime constraints worth knowing

- **Single-instance only.** `ecosystem.config.cjs` pins `instances: 1, exec_mode: 'fork'`, and `npm run restart` `pkill`s stray `tsx` processes first. Two bots polling the same `getUpdates` offset will duplicate replies and fight over `.session-id`.
- **ESM project** (`"type": "module"`). Imports use explicit relative paths without `.js` extensions — `tsx` handles the resolution.
- **`.env` is loaded by `tsx --env-file=.env`**, not `dotenv`. Don't add a `dotenv` import.
- **`.session-id` is state, not config.** Deleting it resets the agent's memory of prior Telegram turns. It's gitignored for that reason.
