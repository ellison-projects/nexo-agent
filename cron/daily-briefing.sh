#!/bin/bash
set -euo pipefail

cd /root/code/nexo-agent

# Run briefing and capture output
BRIEFING_OUTPUT=$(echo "briefing" | /root/.local/bin/claude -p 2>&1)

# Send through the bot's sendMessage helper, which converts markdown to
# Telegram HTML (otherwise **bold** shows up as literal asterisks).
printf '%s' "$BRIEFING_OUTPUT" | npm run --silent send-message > /dev/null

echo "Briefing sent at $(date)"
