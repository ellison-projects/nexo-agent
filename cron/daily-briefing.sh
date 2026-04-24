#!/bin/bash
set -euo pipefail

cd /root/code/nexo-agent

# Export .env vars into the environment so `claude -p` can see them —
# the briefing skill's curl uses $NEXO_API_KEY / $NEXO_USER, and the
# CLI does not auto-load .env. (npm run send-message re-loads via tsx
# --env-file=.env, so this is purely for the claude subprocess.)
set -a
source .env
set +a

# Run the briefing and pipe the output through the bot's sendMessage
# helper, which converts markdown to Telegram HTML (otherwise **bold**
# shows up as literal asterisks).
echo "briefing" | timeout 5m /root/.local/bin/claude -p 2>&1 | npm run --silent send-message > /dev/null

echo "Briefing sent at $(date)"
