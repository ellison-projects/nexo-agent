#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Delete first so pm2 forgets the apps entirely — this disables autorestart
# before we start killing processes. Otherwise pkill trips autorestart and we
# get a duplicate "Nexo online 🚀" message plus a git-pull race.
pm2 delete ecosystem.config.cjs >/dev/null 2>&1 || true

# Clean up any stray dev-mode tsx processes (npm run dev / dev:web orphans).
pkill -f 'tsx.*src/index.ts' || true
pkill -f 'tsx.*src/web/server.ts' || true

# Fresh start — apps were deleted above, so this is a clean register + boot.
pm2 start ecosystem.config.cjs --update-env
pm2 save >/dev/null

pm2 status
