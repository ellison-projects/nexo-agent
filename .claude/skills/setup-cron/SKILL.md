---
name: setup-cron
description: Use when Matt wants to set up a new recurring cron job. Handles creating the script in the `cron/` directory, making it executable, testing it, and installing the cron entry. Triggers include "set up a cron job", "create a daily/weekly/hourly job", "schedule a recurring task", etc.
context: fork
---

# Setup Cron Job

## What this does

Creates a new recurring cron job for the nexo-agent system. This skill handles the full flow: writing the script to `cron/`, making it executable, testing it, and installing the crontab entry.

## When to use

When Matt asks to set up a new recurring task that should run on a schedule. Examples:

- "Set up a daily briefing at 7am"
- "Create a weekly backup job"
- "Schedule a task to run every hour"
- "Add a cron job to check something every morning"

## Prerequisites

- Working directory: `/root/code/nexo-agent`
- `cron/` directory exists (create if needed)
- For jobs that need Telegram: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`
- For jobs that use Claude: `claude` CLI at `/root/.local/bin/claude`

## Flow

### 1. Gather requirements

From Matt's request, determine:

- **What to run** — briefing skill, a script, a command, etc.
- **When to run** — time of day, frequency (daily/weekly/hourly/monthly)
- **Timezone** — Matt is in CST (UTC-6), so 7am CST = 12:00 UTC (adjust for DST if relevant)
- **Output destination** — Telegram message, log file, both, etc.

If anything is unclear, ask before proceeding.

### 2. Write the script

Create a bash script in `cron/<descriptive-name>.sh`. The script should:

- Start with `#!/bin/bash` and `set -euo pipefail` for safety
- `cd /root/code/nexo-agent` to set working directory
- `source .env` if it needs environment variables (Telegram tokens, API keys, etc.)
- Run the actual task (invoke Claude, call an API, run a command)
- Handle output appropriately (send to Telegram, write to file, log, etc.)
- Echo a completion message for the logs

**Key pattern for Claude + Telegram:**

```bash
#!/bin/bash
set -euo pipefail

cd /root/code/nexo-agent

# Load environment variables
source .env

# Run the Claude command and capture output
OUTPUT=$(echo "your skill or prompt here" | /root/.local/bin/claude -p 2>&1)

# Send to Telegram
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": ${TELEGRAM_CHAT_ID}, \"text\": $(jq -Rs . <<< "$OUTPUT")}" \
  > /dev/null

echo "Task completed at $(date)"
```

**Notes:**
- Use `claude -p` for non-interactive mode (required for cron)
- Use `jq -Rs .` to properly JSON-escape the output for Telegram
- `source .env` is critical — cron jobs don't inherit shell environment variables
- Redirect curl output to `/dev/null` to keep logs clean
- The final `echo` goes to syslog via the cron `| logger` redirect

### 3. Make executable

```bash
chmod +x /root/code/nexo-agent/cron/<script-name>.sh
```

### 4. Test the script

Run it directly to verify it works:

```bash
/root/code/nexo-agent/cron/<script-name>.sh
```

Check that:
- It completes without errors
- Output goes to the right place (Telegram, file, etc.)
- Matt confirms he received the expected result

If it fails, debug and fix before installing the cron entry.

### 5. Build the cron schedule

Use standard cron syntax: `minute hour day month weekday command`

**Common patterns:**

- **Daily at specific time:** `0 12 * * *` (12:00 UTC = 7am CST for daily 7am job)
- **Hourly:** `0 * * * *` (top of every hour)
- **Weekly (Monday 9am):** `0 14 * * 1` (14:00 UTC Monday = 9am CST Monday)
- **Every N hours:** `0 */3 * * *` (every 3 hours)
- **First of month:** `0 12 1 * *` (12:00 UTC on day 1)

**Important:** Matt is in CST (UTC-6). Convert his requested times to UTC for the cron entry.

The full cron entry should be:

```
<schedule> /root/code/nexo-agent/cron/<script-name>.sh 2>&1 | logger -t nexo-<job-name>
```

The `2>&1 | logger -t nexo-<job-name>` part sends all output (stdout + stderr) to syslog with a tag for easy filtering.

### 6. Install the cron entry

```bash
(crontab -l 2>/dev/null || true; echo "<schedule> /root/code/nexo-agent/cron/<script-name>.sh 2>&1 | logger -t nexo-<job-name>") | crontab -
```

This appends to the existing crontab (or creates one if none exists).

### 7. Verify installation

```bash
crontab -l
```

Show Matt the installed entry and confirm it looks right.

### 8. Document and confirm

Tell Matt:
- What job was created
- Where the script lives (`cron/<name>.sh`)
- When it will run (in his timezone, CST)
- How to check logs: `journalctl -t nexo-<job-name> --since today`
- Confirm the first run time (e.g., "You'll get your first briefing tomorrow at 7am CST")

## Checking logs

Jobs log to syslog via the `logger` command. To view logs:

```bash
journalctl -t nexo-<job-name> --since today
journalctl -t nexo-<job-name> --since "2026-04-23"
journalctl -t nexo-<job-name> -n 20
```

## Troubleshooting common issues

**"unbound variable" errors:**
- The script isn't sourcing `.env` before using environment variables
- Add `source .env` after the `cd` line

**Job doesn't run:**
- Check `crontab -l` to verify it's installed
- Check `systemctl status cron` (or `crond` on some systems) to verify cron daemon is running
- Check logs with `journalctl -t nexo-<job-name>`

**Wrong time:**
- Remember to convert CST to UTC (CST = UTC-6, so 7am CST = 13:00 UTC in summer, 12:00 UTC in winter)
- Use a UTC time converter if uncertain

**Telegram not sending:**
- Verify `.env` has `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- Test the curl command manually
- Check that `jq` is installed (`which jq`)

## Don't

- Don't skip testing the script before installing the cron entry
- Don't forget to `chmod +x` the script
- Don't forget to convert CST to UTC for the schedule
- Don't hardcode secrets — always load from `.env`
- Don't use interactive commands (`claude` without `-p`, commands that wait for input, etc.)
