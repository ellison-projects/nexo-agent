#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Delete by name so pm2 forgets the apps entirely — this disables autorestart
# before we start killing processes, and clears any duplicate entries left by
# previous `pm2 start` runs. Called one at a time because `pm2 delete a b` has
# been observed to only delete the first name on some pm2 versions.
pm2 delete nexo-agent >/dev/null 2>&1 || true
pm2 delete nexo-web >/dev/null 2>&1 || true

# Clean up any stray dev-mode tsx processes (npm run dev / dev:web orphans).
pkill -f 'tsx.*src/index.ts' || true
pkill -f 'tsx.*src/web/server.ts' || true

# Fresh start — apps were deleted above, so this is a clean register + boot.
pm2 start ecosystem.config.cjs --update-env
pm2 save >/dev/null
