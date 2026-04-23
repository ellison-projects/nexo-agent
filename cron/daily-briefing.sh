#!/bin/bash
set -euo pipefail

cd /root/code/nexo-agent

# Load environment variables
source .env

# Run briefing and capture output
BRIEFING_OUTPUT=$(echo "briefing" | /root/.local/bin/claude -p 2>&1)

# Send to Telegram via the bot API
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": ${TELEGRAM_CHAT_ID}, \"text\": $(jq -Rs . <<< "$BRIEFING_OUTPUT")}" \
  > /dev/null

echo "Briefing sent at $(date)"
