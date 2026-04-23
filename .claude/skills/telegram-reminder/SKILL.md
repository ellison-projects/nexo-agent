---
name: telegram-reminder
description: Use ONLY when Matt explicitly says he wants the reminder delivered via Telegram — trigger phrases include "remind me with telegram", "remind me on telegram", "telegram reminder", "send me a telegram in X minutes", "telegram me in X". Schedules a one-shot Telegram message for a future time using the local `at` daemon on this box. For any reminder request that does NOT specifically name Telegram ("remind me to call mom tomorrow", "add a reminder about X", "set a reminder for 3pm") use the `nexo-prm` skill instead — NexoPRM's AI reminders are the default system AND now auto-deliver to Telegram via the `nexo-reminders` pm2 app, so a PRM reminder will still land on Matt's phone. This skill is a narrow override only. Also handles listing/cancelling telegram-scheduled jobs via `atq` / `atrm`. Only suitable for short-term reminders (minutes to hours) — for multi-day reminders defer to `nexo-prm`.
---

# Telegram reminder

## What this does

Schedules a one-shot Telegram message via the local `at` daemon. When the scheduled time arrives, `atd` runs a shell job that curls the Telegram Bot API and delivers the message to Matt's chat.

## When to use — strict

Only when Matt **explicitly names Telegram** as the delivery channel. Examples that match:

- "remind me with telegram in 10 minutes to take the laundry out"
- "telegram me at 3pm to call the dentist"
- "send a telegram reminder in 45 min about the oven"

Examples that do **not** match — these route to `nexo-prm`:

- "remind me tomorrow to call mom"
- "set a reminder for 3pm"
- "add a reminder about the dentist appointment"

When in doubt, use `nexo-prm`. Telegram-via-`at` is the narrow override; PRM is the default.

**PRM reminders still reach Telegram.** The `nexo-reminders` pm2 app polls the NexoPRM iCalendar feed and auto-schedules Telegram pushes for upcoming AI reminders, todo reminders, home items, and recurring tasks (all-day items fire at 8am America/Chicago on the date; timed items fire at the event moment). That means routing a generic request to `nexo-prm` **still delivers on Telegram** within ~5 minutes of the PRM side going live — Matt does not lose the phone push by using PRM. The `nexo-reminders` job also reconciles cancellations: if a PRM reminder is marked done or deleted, the paired `at` job is `atrm`'d on the next tick.

Use this skill only when Matt wants a push that bypasses PRM entirely — e.g. short-term "10 min from now" nudges where round-tripping through PRM adds friction for no benefit.

## Prerequisites

- `at` installed and `atd` running on this box (one-time: `sudo dnf install -y at && sudo systemctl enable --now atd`).
- Env vars `TELEGRAM_REMINDER_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set — dedicated reminder bot credentials (from `.env`).

Sanity-check with `systemctl is-active atd` before scheduling if you suspect the daemon is down. If it's not running, tell Matt and stop — don't silently fail.

## Scheduling flow

1. **Parse Matt's intent into two pieces:**
   - **Time spec** — anything `at` accepts. Common forms: `now + 10 minutes`, `now + 1 hour`, `now + 2 hours`, `15:30`, `3pm`, `tomorrow 09:00`, `4pm tomorrow`.
   - **Message** — the text to push. Clean it up per the "improve my wording" rules in `CLAUDE.md` — don't parrot back "take laundry out", write *"Take the laundry out of the dryer"*. **Always prefix with `⏰` to indicate it's a scheduled message.** Then add a content-specific emoji when it fits (🧺 laundry, 🍳 oven, 💊 meds, 📞 call). Don't overdo it.

2. **Confirm with Matt before scheduling.** Show him the parsed time and the final message text so he can catch misinterpretations. Example:

   > I'll schedule a Telegram reminder for 3:40pm (10 min from now): *"⏰ 🧺 Take the laundry out of the dryer"*. Good?

   If he corrects either piece, adjust and re-confirm. If the original phrasing was unambiguous and short, a single line confirm-as-you-schedule is fine — use judgment.

3. **Schedule via `at`.** Use a Bash heredoc, expanding the env vars at scheduling time so the values are baked into the at-spool script (at-jobs don't inherit the live shell env reliably). Use `--data-urlencode` for the message so emoji, punctuation, and quotes survive the URL-encode step:

   ```bash
   at now + 10 minutes <<EOF
   curl -s "https://api.telegram.org/bot${TELEGRAM_REMINDER_BOT_TOKEN}/sendMessage" \\
     -d "chat_id=${TELEGRAM_CHAT_ID}" \\
     --data-urlencode "text=⏰ 🧺 Take the laundry out of the dryer"
   EOF
   ```

   Notes on escaping:
   - The outer heredoc is unquoted (`<<EOF`, not `<<'EOF'`) so `${TELEGRAM_REMINDER_BOT_TOKEN}` and `${TELEGRAM_CHAT_ID}` expand now, not at at-run time.
   - Keep the message inside the `text=` double quotes. If the message itself contains a literal `"` or backtick or `$`, escape it with `\` inside the heredoc, or (cleaner) set `MSG="..."` first with careful quoting and use `--data-urlencode "text=${MSG}"`.
   - Don't add `&& echo` or other extras — keep the job a single curl so it's easy to read via `at -c <n>`.

4. **Report back.** `at` writes the scheduled job line to stderr: `job 5 at 2026-04-21 15:40`. Capture it and tell Matt the job number and scheduled time. Example:

   > Scheduled Telegram reminder #5 for 3:40pm: *"⏰ 🧺 Take the laundry out of the dryer"*.

   If `at` fails (daemon down, bad time spec), report the error verbatim and stop.

## Listing, inspecting, cancelling

- **List pending jobs:** `atq` — prints `<job#> <time> a <user>` per row.
- **Inspect a job's script:** `at -c <job#>` — shows the full shell script `at` will run, including the baked-in curl. Useful for finding which job matches a given message.
- **Cancel a job:** `atrm <job#>`.

When Matt says something like "cancel that telegram reminder" or "what telegram reminders do I have pending":

1. Run `atq` to get the job list.
2. If there's exactly one pending and he said "that", assume it.
3. Otherwise run `at -c <n>` on each to find the one matching his description (grep for a keyword from the message).
4. Confirm the match with Matt before `atrm`-ing — show him the message text from the matched job.

## Don't

- Don't use this skill for generic reminders. If Matt didn't say "telegram", route to `nexo-prm`.
- Don't schedule more than ~24 hours out. For multi-day stuff, `nexo-prm`'s AI reminders are better (persistent, reviewable, survive across infra moves). Push back if Matt asks for a 3-day-out telegram reminder and suggest PRM instead.
- Don't log or echo the bot token in replies. The token lives in `.env`; keep it there. The at-spool script on disk is an accepted tradeoff, but don't broadcast it back to the Telegram chat.
- Don't forget to confirm before scheduling — a wrong time or bad wording is annoying to fix after the fact (you have to `atrm` and reschedule).
