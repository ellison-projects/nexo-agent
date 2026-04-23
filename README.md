# nexo-agent

Personal assistant agent that runs on Telegram, backed by the Claude Agent SDK.

Three pm2 apps live in this repo:

- **`nexo-agent`** — the main Telegram bot (`src/index.ts`, config in `ecosystem.config.cjs`).
- **`nexo-web`** — tiny static server used for sharing content (`src/web/server.ts`, same ecosystem file).
- **`nexo-debug-agent`** — a second, independent Telegram bot for diagnosing and fixing the main agent when it's broken (`src/debug/index.ts`, config in `ecosystem.debug.config.cjs`).

## pm2 setup on a fresh Linux box

One-time, assuming Node 22+ and a populated `.env`:

```bash
npm ci                        # pm2 is in devDependencies — use `npx pm2 ...`
                              # or install globally with `npm i -g pm2`
npm start                     # starts nexo-agent + nexo-web
npm run start:debug           # starts nexo-debug-agent
pm2 save                      # snapshot the current app list to ~/.pm2/dump.pm2
pm2 install pm2-logrotate     # rotate/compress logs so they don't fill disk
pm2 startup                   # prints a `sudo env PATH=... pm2 startup systemd ...`
                              # command — copy-paste and run it once
```

What each piece does:

- **`pm2 save`** writes the running app list to `~/.pm2/dump.pm2`. This is the source of truth for `pm2 resurrect`. Re-run whenever the desired set of running apps changes.
- **`pm2 startup`** installs a systemd unit that starts the pm2 daemon on server boot. The unit calls `pm2 resurrect` automatically, which reads `dump.pm2` and brings the saved apps back up.
- **`pm2 install pm2-logrotate`** — pm2 module that rotates `~/.pm2/logs/*.log`. Defaults are reasonable; adjust with `pm2 set pm2-logrotate:max_size 10M` etc. if needed.

After the above, a server reboot brings all three apps back automatically. No manual intervention.

## Daily commands

| Command | What it does |
|---|---|
| `npm start` | pm2-start the main apps (nexo-agent + nexo-web). |
| `npm run start:debug` | pm2-start the debug agent. |
| `npm run stop` | pm2-stop the main apps. |
| `npm run stop:debug` | pm2-stop the debug agent. |
| `npm run restart` | Bounce the main apps (`scripts/restart.sh`) — leaves debug untouched. |
| `npm run reset-session` | Wipe main's Claude session memory (`.session-id`) and restart. |
| `npm run logs` | `pm2 logs` — tail all apps. Use `pm2 logs nexo-debug-agent` for one. |
| `npm run status` | `pm2 status` — list apps and their state. |
| `npm run dev` | Run main agent locally (no pm2). Collides with the pm2 instance — stop main first. |
| `npm run dev:debug` | Run debug agent locally (no pm2). |

Whenever you change the desired running set (adding/removing an app, enabling debug on a new box), re-run `pm2 save` so the resurrect list stays in sync.

## Why three pm2 apps

- **Main and web** share `ecosystem.config.cjs` because they're bounced together by `npm run restart`.
- **Debug** is deliberately in its own `ecosystem.debug.config.cjs` so the main lifecycle scripts (`restart`, `npm start`) cannot reach it. That independence is the whole point: when main is crashed or in a restart loop, the debug agent is still reachable on Telegram (different bot token) and can read logs, reproduce errors, edit code, and bounce main for you.

See `CLAUDE.md` for a more detailed architecture tour and capability list.
