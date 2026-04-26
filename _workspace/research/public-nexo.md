# Opening Nexo to the public — research

**Status:** exploratory, no decisions made
**Date:** 2026-04-26

## The idea

Anyone signs up on a website, gets connected to a personal Nexo agent over Telegram. Their data gets scoped to their user id in NexoPRM. Public bot, multi-tenant.

## What this is really asking

Today's Nexo is a single-user appliance — one VPS, one pm2 process, one Telegram chat id allow-listed in `.env`, one `NEXO_API_KEY`, one `.session-id` file, one git repo full of Matt-specific docs and skills. To go public, almost every "one" in that sentence has to become "per user."

The work splits into two big buckets:

1. **The agent run model** — how a single message from any of N users becomes a running `query()` call with the right session, the right scope, the right tools, and gets billed to the right account.
2. **Everything around it** — auth, data isolation, abuse, billing, legal, support.

---

## 1. How to run the agent (your main concern)

### Today's model

- One long-poll loop in `src/index.ts` filtered to `TELEGRAM_CHAT_ID`.
- Each message → `askNexo()` in `src/ai.ts` → `query()` with `resume: <single .session-id>`.
- `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `cwd` = this repo.
- Skills live in `.claude/`, can read/write the repo (e.g. `remember` commits to git, `briefing` writes snapshots into `public/briefings/`).

This is correct for one trusted user on his own VPS. It is **not safe or scalable** for a public bot in any of those properties.

### Decision space — three viable architectures

**(a) Single process, multi-session router.** Keep one Node process. Replace `TELEGRAM_CHAT_ID` filter with a user lookup. Store `session_id` per user in a database instead of `.session-id`. Each `query()` call passes the right `resume`. Cheap, simple, but **shares one filesystem and one OS user across all tenants** — you cannot keep `bypassPermissions` on. Tooling has to be locked down to API-only skills (no Bash, no Read/Write). Hard ceiling on concurrency too — one Node loop is fine for low usage but doesn't scale horizontally without coordination.

**(b) Worker pool, ephemeral invocations.** Telegram webhook (not long-poll) → queue (Redis/SQS) → workers. Each worker pulls a job, runs `query()`, replies, exits. Stateless except for the per-user session_id pulled from the DB. This is the natural fit for a public bot — scales horizontally, retries are clean, one bad message can't poison the loop. Still needs tool sandboxing.

**(c) Container per session.** Each user's agent runs in a container with a per-user working directory mounted. Strongest isolation, gives you back the ability to expose richer tools (file edits, code exec) safely. Costs: container start latency on cold sessions, infra complexity (k8s or Fly machines or similar), real money per active user.

**Recommended path:** start at (b), keep the door open to (c) for paid tiers that need richer tools. Don't start at (a) — the temptation to "just leave bypassPermissions on for now" is too dangerous.

### Switching long-poll → webhook

`getUpdates` long-poll is fine for one user; for a public bot you want webhooks so Telegram fans out updates to your worker pool directly. `skipBacklog()` and the `.session-id` file both go away. Note: webhooks need a public HTTPS endpoint with a valid cert (or use Telegram's self-signed support).

### Session storage

`.session-id` becomes a row in a `sessions` table:

```
user_id | session_id | last_active_at | message_count
```

Optionally TTL old sessions to keep context windows manageable / costs down (e.g. auto-reset after N days idle, or after M turns).

### Tool & skill surface for public users

This is the part most likely to bite you. The current agent has:

- `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep` — all dangerous in multi-tenant, all currently allowed.
- Skills that write to the repo: `remember` (git commits!), `briefing`/`look-ahead`/`look-back` (snapshots into `public/`), `refresh-api-docs`, `setup-cron` (writes crontab on the host — absolutely not for public users).
- Skills that are Matt-specific: every single one references his data, his files, his preferences, or his platform account.

For public users, the safe surface is roughly:
- NexoPRM API skills (`nexo-people`, `nexo-prm`) — but rewritten to authenticate as the calling user, not via a shared service key.
- A user-scoped equivalent of briefing/look-ahead/look-back that returns the briefing inline instead of writing files to a shared repo.
- `remember` would need to write to a per-user store (NexoPRM stash? a user_notes table?) instead of git.
- No Bash, no filesystem, no shell. No `setup-cron`. No `refresh-api-docs`.

This is a meaningful refactor — most skills assume "the repo I'm running in is Matt's repo."

---

## 2. Auth & identity

- **Signup flow.** Web account → user gets a unique Telegram deep link (`t.me/NexoBot?start=<token>`). First message hits the bot, you decode the token, link `telegram_user_id` ↔ `nexo_user_id`. Standard pattern.
- **Reverse flow** (Telegram-first signup) is also worth supporting — DM the bot, it asks for an email, sends a verification link, account created.
- **Re-auth / device changes.** Users will lose phones, change Telegram numbers. Need a way to re-link.
- **Bot identity per user.** One bot serves all users; Telegram already isolates chats by user_id, so this is fine. Don't try to spin up a bot per user.

---

## 3. Data isolation in NexoPRM

This is potentially the largest hidden cost. Today the agent uses `NEXO_API_KEY` + `NEXO_USER` — one service-account key, all data is Matt's. For public:

- Does NexoPRM already support proper multi-tenant accounts with per-user API tokens? If not, that platform work is on the critical path.
- Auth model: per-user API keys minted at signup, stored encrypted server-side, passed to the agent on each invocation. The agent never sees a shared key.
- Every API call needs user-scoped enforcement on the server side — don't rely on the agent passing the right `user_id`. A buggy or jailbroken agent must not be able to read another user's data.
- Consider whether you want users to ever be able to log in to the NexoPRM web UI directly, or whether the agent is the only interface. That changes the auth model.

---

## 4. Cost & billing

Opus calls aren't cheap. A single chatty user could rack up $X/day in token costs. You cannot offer this for free without a hard cap.

- Track tokens-in / tokens-out per user per call (the SDK exposes this).
- Free tier with a daily/monthly token or message cap; paid tiers above that.
- Decide model tiering: free users on Haiku/Sonnet, paid on Opus? Or a single tier with limits?
- Stripe (or similar) for billing. Webhook → flip a flag in the user row.
- Hard kill switch when a user hits their cap — agent replies "you've hit your limit, upgrade here" instead of running.

---

## 5. Trust & safety / abuse

- **Jailbreaks.** Public users will try. Tool sandbox (section 1) is your real defense; system prompt instructions are not.
- **Illegal content.** Telegram will eventually forward abuse reports. You need a way to suspend a user, view their conversation if legally required, and respond.
- **Spam / bot signups.** Email verification + maybe a captcha on signup. Rate-limit messages per user.
- **Prompt injection from external content.** If the agent fetches a URL on behalf of a user, that page can try to hijack it. Standard agent-security territory; mitigate by tightly scoping what tools can do post-fetch.
- **Account takeover.** Telegram session compromise = full agent access. Consider sensitive ops (data export, account deletion) requiring re-verification.

---

## 6. Privacy & legal

- **Privacy policy + ToS** before launch. Non-negotiable.
- **Data residency.** Where does user data live? Where do Anthropic API calls go?
- **GDPR/CCPA.** Right to export, right to delete. Build the export and the cascade-delete on day one — retrofitting is painful.
- **Anthropic ToS.** Confirm you can use the API in a multi-tenant consumer product, and what attribution / disclosure you owe end users. (You almost certainly need to disclose "powered by Claude" or similar.)
- **AI advice liability.** People will ask the agent medical, legal, financial questions. Have a disclaimer in onboarding.

---

## 7. Operational concerns

- **Observability.** Today you `pm2 logs` and read your own bot's output. With N users you need structured logs, per-user trace ids, an error tracker (Sentry), and dashboards for queue depth / latency / failure rate.
- **Support.** A support inbox, a way to look up a user's recent conversation when they report a bug.
- **Status page / SLA expectations.** Users will assume uptime once they're paying.
- **The debug bot.** `nexo-debug-agent` is great for one user. Multi-tenant, you need a real ops console, not a Telegram side-channel.

---

## 8. Skills that don't survive the transition

These need rewriting or removal before a public launch:

- `remember` — can't git-commit per-user data. Rewrite to NexoPRM stash or a user_notes table.
- `setup-cron` — never expose to public users.
- `refresh-api-docs` — Matt-only ops tool.
- `briefing`, `look-ahead`, `look-back` — currently snapshot into the shared repo's `public/briefings/`. Either return inline only, or snapshot into a per-user store.
- `nexo-people`, `nexo-prm` — the logic is fine but they need to authenticate as the calling user, not via the shared `NEXO_API_KEY`.
- All references to `docs/matt/` — gone for public users; replace with a per-user "about me" stored in PRM.

---

## Suggested order if you pursue this

1. **Decide the agent run model** (recommend: webhook + worker pool + per-user session row in DB). Build a tiny PoC with two test users sharing one bot before touching anything else.
2. **Lock down tools** — strip Bash/Read/Write/Edit, prove the agent still works end-to-end with API-only skills.
3. **Rework NexoPRM auth** — per-user API tokens, server-side scoping. This is probably the longest pole.
4. **Signup flow + Telegram linking.**
5. **Billing + caps.** Don't launch without a hard token cap.
6. **Privacy policy, ToS, abuse handling, support inbox.**
7. **Soft launch to a small invite list before going fully public.**

## Open questions to chase next

- What's NexoPRM's current state on multi-tenancy? Is there an existing user/auth model, or does it need to be built?
- What's your target audience and price point? That drives model tier (Haiku vs Opus) and infrastructure choices.
- Are you OK with this being a paid product from day one, or do you want a free tier? (Free tier dramatically increases abuse surface.)
- Do you want the web app to be a real dashboard (view your data, edit your profile) or just a signup/billing portal with Telegram as the only real interface?
