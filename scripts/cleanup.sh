#!/usr/bin/env bash
set -euo pipefail

# Same rationale as restart.sh: when the agent itself triggers cleanup (via
# Telegram), `pm2 delete nexo-agent` below will take the agent — and this
# script with it — down before `pm2 start` runs. Detect non-interactive
# invocation and re-launch in a new session so the start step still happens.
if [ ! -t 0 ] && [ "${NEXO_CLEANUP_DETACHED:-}" != "1" ]; then
  LOG=/tmp/nexo-cleanup.log
  NEXO_CLEANUP_DETACHED=1 setsid -f bash "$0" "$@" </dev/null >"$LOG" 2>&1
  echo "Cleanup running detached — tail $LOG for progress."
  exit 0
fi

cd "$(dirname "$0")/.."

# Detached runs have no parent to post to Telegram for us. Load .env ourselves.
if [ "${NEXO_CLEANUP_DETACHED:-}" = "1" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

notify() {
  [ "${NEXO_CLEANUP_DETACHED:-}" = "1" ] || return 0
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || return 0
  curl -sS -o /dev/null --max-time 5 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$1" || true
}

echo "==> Cleanup: resetting Nexo to a clean state"
notify "🧨 Cleanup: full reset incoming..."

echo "  - Wiping Claude session memory (.session-id)"
rm -f .session-id

echo "  - Deleting main pm2 apps by name"
pm2 delete nexo-agent >/dev/null 2>&1 || true
pm2 delete nexo-web >/dev/null 2>&1 || true

notify "🧹 Old apps cleared, booting fresh..."

echo "  - Starting apps fresh from ecosystem.config.cjs"
pm2 start ecosystem.config.cjs --update-env
pm2 save >/dev/null
