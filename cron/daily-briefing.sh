#!/bin/bash
set -euo pipefail

cd /root/code/nexo-agent

# Run the briefing and pipe the output through the bot's sendMessage
# helper, which converts markdown to Telegram HTML (otherwise **bold**
# shows up as literal asterisks).
echo "briefing" | /root/.local/bin/claude -p 2>&1 | npm run --silent send-message > /dev/null

echo "Briefing sent at $(date)"
