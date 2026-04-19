#!/usr/bin/env bash
set -euo pipefail

# Same rationale as restart.sh: when the agent itself triggers cleanup (via
# Telegram), `pm2 kill` below will take the agent — and this script with it —
# down before `pm2 start` runs. Detect non-interactive invocation and re-launch
# in a new session so the start step still happens.
if [ ! -t 0 ] && [ "${NEXO_CLEANUP_DETACHED:-}" != "1" ]; then
  LOG=/tmp/nexo-cleanup.log
  NEXO_CLEANUP_DETACHED=1 setsid -f bash "$0" "$@" </dev/null >"$LOG" 2>&1
  echo "Cleanup running detached — tail $LOG for progress."
  exit 0
fi

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
