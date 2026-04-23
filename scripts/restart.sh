#!/usr/bin/env bash
set -euo pipefail

# When the agent itself triggers a restart (via Telegram), this script runs
# as a child of the agent process. `pm2 delete nexo-agent` below then kills
# that parent, which takes us down with it before `pm2 start` runs. Detect
# non-interactive invocation and re-launch ourselves in a new session so we
# survive the parent's death.
if [ ! -t 0 ] && [ "${NEXO_RESTART_DETACHED:-}" != "1" ]; then
  LOG=/tmp/nexo-restart.log
  NEXO_RESTART_DETACHED=1 setsid -f bash "$0" "$@" </dev/null >"$LOG" 2>&1
  echo "Restart running detached — tail $LOG for progress."
  exit 0
fi

cd "$(dirname "$0")/.."

# Detached runs have no parent to post to Telegram for us — the agent that
# invoked us is being killed. Load .env ourselves and notify directly.
if [ "${NEXO_RESTART_DETACHED:-}" = "1" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

notify() {
  [ "${NEXO_RESTART_DETACHED:-}" = "1" ] || return 0
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  curl -sS -o /dev/null --max-time 5 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" || true
}

notify "🔄 Restarting Nexo..."

# Delete by name so pm2 forgets the apps entirely, clearing any duplicate
# entries left by previous `pm2 start` runs. Called one at a time because
# `pm2 delete a b` has been observed to only delete the first name on some
# pm2 versions.
pm2 delete nexo-agent >/dev/null 2>&1 || true
pm2 delete nexo-web >/dev/null 2>&1 || true
pm2 delete nexo-reminders >/dev/null 2>&1 || true

notify "🧹 Old apps cleared, booting fresh..."

# Fresh start — apps were deleted above, so this is a clean register + boot.
pm2 start ecosystem.config.cjs --update-env
pm2 save >/dev/null
