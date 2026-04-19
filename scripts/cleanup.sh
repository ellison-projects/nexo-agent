#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Cleanup: resetting Nexo to a clean state"

echo "  - Wiping Claude session memory (.session-id)"
rm -f .session-id

echo "  - Killing the pm2 daemon (stops every pm2-managed process)"
pm2 kill >/dev/null 2>&1 || true

echo "  - Killing any stray dev-mode tsx processes"
pkill -f 'tsx.*src/index.ts' || true
pkill -f 'tsx.*src/web/server.ts' || true

echo "  - Starting apps fresh from ecosystem.config.cjs"
pm2 start ecosystem.config.cjs --update-env
pm2 save >/dev/null
