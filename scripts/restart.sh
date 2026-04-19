#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Clear stray dev-mode processes before pm2 takes over. `npm run dev` / `dev:web`
# leave tsx behind on ctrl-c, and two agents polling getUpdates will duplicate
# replies and fight over .session-id (see CLAUDE.md).
pkill -f 'tsx.*src/index.ts' || true
pkill -f 'tsx.*src/web/server.ts' || true

# Idempotent: registers any app from the ecosystem file that pm2 doesn't know
# about yet, and restarts the rest. Works the same on a fresh box or after edits.
pm2 startOrRestart ecosystem.config.cjs --update-env

pm2 status
