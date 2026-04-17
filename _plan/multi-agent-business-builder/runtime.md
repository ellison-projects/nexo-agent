# Multi-Agent Business Builder — Runtime

How the crew runs: the loop, the stop conditions, the cost rails, the commands.

## Round-robin loop

A **round** is one pass through all four roles plus a synthesis step. A **session** is however many rounds run back-to-back before the command exits — typically a ~30-minute batch before bed.

```
for each role in [strategist, cto, marketer, analyst]:
  1. load brief.md + state/*.md + last N transcripts (including THIS round's prior turns)
  2. prompt the role with only: "You are <role>. Here's the goal. Here's the state.
     Take your turn." Agent decides what to do.
  3. let the agent use Edit/Write on files under state/ (scoped via cwd)
  4. append its reasoning + file diff summary to transcripts/<timestamp>-<role>.md

last turn of each round is the Strategist's, and by convention that turn writes
state/daily/YYYY-MM-DD.md — whatever the Strategist judges most useful for the
human to see in the morning.
```

### Escape hatch: `questions.md`

We picked round-robin over parallel-with-messaging because it's deterministic and cheap (no file-edit races, no deadlocks, no runaway chatter). The one weakness round-robin has is that an agent who needs a clarifying input from another role has to wait for the next round. `questions.md` fixes that without the complexity of a real message bus.

Format is just append-only bullets:

```markdown
## Pending
- [ ] 2026-04-17T23:42 marketer → cto: Is a Chrome extension feasible within $200 infra budget?
- [ ] 2026-04-17T23:58 analyst → strategist: Are we committed to SaaS, or open to services?

## Resolved
- [x] 2026-04-17T23:15 strategist → cto: What's our pre-sell page stack?
      cto @ 2026-04-17T23:40: Stripe Payment Link + a static HTML one-pager. Zero code beyond copy.
```

The ANSWER beat at the top of each turn enforces that questions get cleared before they pile up. If you see `questions.md` growing round-over-round without shrinking, that's a signal the crew is blocked on each other and we should reconsider the architecture.

Each round overwrites the day's plan in place. If the session crashes at round 17, you still have round 16's plan waiting for you in the morning — it's not worse than no plan, it's just not fully cooked.

Why round-robin and not parallel: sequential turns mean each role reacts to the previous role's edits. The Marketer sees what the CTO just decided to ship; the Strategist synthesizes at the end. Parallel runs would race on file edits and produce incoherent plans.

Why Strategist closes the round: matches the PDF's framing — the human's one real job is saying yes/no, and the Strategist's job is to tee up that decision.

## Run mode (primary use case)

The intended flow: **11pm you SSH in, start the crew, brush your teeth, go to bed. It's done within 30 minutes.** Everything below flows from that.

### Detachment

`npm run crew -- run <slug>` launches through pm2 as a one-off process (`pm2 start ... --no-autorestart`), which means it survives SSH disconnect and shows up in `pm2 list` for inspection. A second invocation while one is already running refuses to start — same single-instance rule as the bot.

Alternative if pm2 feels heavy for a one-off: `nohup npm run crew ... > log 2>&1 &` in a `tmux` session. Whichever we pick, the CLI abstracts it: user always types `npm run crew -- run`.

### Stop conditions

Whichever triggers first:

- `--duration 30m` — wall-clock duration from start (default: **30 minutes**). Primary knob.
- `--until HH:MM` — optional: wall-clock deadline instead of duration (for longer runs)
- `--rounds N` — hard cap on round count (default: 15 — fits comfortably in 30m)
- `--budget $X` — token-cost ceiling (default: $5/session, conservative for a 30m run); tallied from the SDK's usage events
- **Confidence converged**: every one of the 4 agents rates the current top pick ≥80% likely to hit the goal, each with a one-line reason

All four are ORed. Any one trips, session exits clean, final daily plan stays on disk.

### Confidence signal

Each agent scores the current top pick at the end of every turn, in their **own private** `notes/<role>.md` file. No agent ever sees another agent's score. Kills anchoring at the source.

Format in `notes/<role>.md` is a running diary — agent appends on every turn:

```markdown
# strategist notes

## Round 1, 2026-04-17T23:12
Top pick: "AI TikTok hook generator for Shopify stores"
Confidence: 60%
Reason: promising niche but no comment data yet to validate demand.
Thinking: want to see marketer's hook drafts before I commit higher.

## Round 2, 2026-04-17T23:34
Top pick: same
Confidence: 75%
Reason: marketer's hook #2 is strong; still worried about niche size.
Thinking: if analyst's next turn surfaces a comparable-sized audience, I'll push to 85+.
```

Two benefits beyond no-anchoring:

1. **Persistent memory per role.** Each agent reads its own notes at the start of every turn — "last round I was at 60% because X; has X been addressed?" The diary becomes the agent's through-line across rounds, complementing the per-role `.session-id`.
2. **Forensic clarity.** Every confidence shift has a reason attached and a timestamp. After a session you can trace exactly why convergence happened (or didn't).

**The runner code**, not the agents, does convergence math. After each round it reads the latest entry in every `notes/<role>.md` and checks:

1. Does each role's most recent score tag **the current top pick** from `working.md`?
2. Is each score ≥80%?

If both yes → converged, exit. If either no → run another round. Agents aren't aware of the threshold or the other scores — they just keep noting their own view.

**The stale-score problem this solves.** If the Strategist scores pick "X" at 90% in turn 1 of round N, and then the CTO in turn 2 pivots the plan to "Y," the Strategist's 90% is now stale (it was for X, not Y). Because each note is tagged with the pick it scored, the runner sees Strategist's latest note is on X while the current top pick is Y — convergence fails, round N+1 runs. In round N+1, the Strategist reads its own notes ("I was 90% on X because..."), sees the current pick is Y, and re-scores against Y. The system self-corrects without any cross-agent visibility.

Guardrail against agreement theater: each turn must include both a number and a one-line reason. A vague reason (e.g. "feels good") gets bounced back by the runner — same role re-runs that turn beat with "be specific."

### Cost safety

It's your money, and you're about to be asleep. Layered defenses:

**Hard ceilings** (session exits when any trips, whichever comes first):
- `--duration 30m` — default **30 minutes** from start. Primary ceiling. At ~45s per Opus turn × 4 agents = ~3 minutes per round, so ~10 rounds realistic per session.
- `--budget $5` — conservative token-cost cap; raise once you have session data.
- `--rounds 15` — round cap.
- Confidence converged (all 4 roles ≥80%) — the common path to exit early.

**Graceful kill**: when duration/budget/rounds trips, the runner lets the current agent turn finish, writes `daily/<date>.md`, then exits. Hard `SIGKILL` only if graceful exit doesn't return within 2 more minutes.

**Worst-case math**: 4 roles × 15 rounds × ~$0.15/Opus turn ≈ $9 hard absolute ceiling. Budget cap makes it $5. With a 30-minute wall-clock, even pathological token bloat can't outrun the clock.

**Pre-flight** (before round 1 runs):
```
$ npm run crew -- run my-biz
Starting session for my-biz
Model: Opus  Duration cap: 30m  Budget cap: $5
Estimated spend range: $1–$4 (based on 4 roles × likely 5–10 rounds to convergence)
Hard ceiling: 30m OR 15 rounds OR $5
Starting in 10s... (ctrl-C to abort)
```

**Live monitoring** — `npm run crew -- status my-biz` from your phone shows current spend, round count, and time remaining. Same session as whoever triggered it (pm2 tracks it).

**Phone alerts** (v1 exception to "no Telegram integration" — safety rails are worth it): reuse the existing bot to send you a Telegram message at:
- Session start (so you can confirm it's running)
- 75% budget burned (early warning)
- Session end (spend, rounds, convergence status)

**Emergency kill** — `npm run crew -- stop my-biz` is instant. Also reachable by replying `stop my-biz` to the Telegram alert, if we wire that up.

**Per-turn `maxTurns` cap** (SDK-level): each agent's `query()` call gets `maxTurns: 8`, so a single turn can use at most 8 tool-use iterations before the SDK returns. Prevents an agent from getting stuck in a Read → Edit → Read → Edit loop. 8 is plenty for "read state, think, write a few files, done."

**Context trimming** (keeps per-turn cost from ballooning round-over-round): an agent's prompt only loads the last N entries of its own `notes/<role>.md`, not the full history. `working.md` is loaded in full but is size-capped (rejected if > ~10K tokens; crew instructed to keep it tight). Older notes entries get summarized by the agent itself when their file grows past the threshold.

**Daily cap** — config option in `brief.md`: `max_sessions_per_day: 1`. Prevents accidental double-triggers from doubling your spend.

All of this is also mirrored into `session-log.md` per round so you can audit where the money went.

**If you're using a Claude Max subscription** (like Robbie): there's no per-token bill. The `--budget` cap becomes less important, but rate limits matter more. In that case the real risk isn't money — it's burning through your daily Claude allowance and locking yourself out of Claude for your own dev work (including the Telegram bot). Safer defaults with a Max subscription:
- Leave `--duration 30m` and `--rounds 15` as primary ceilings; they're the meaningful ones.
- Monitor for 429 rate-limit errors from the SDK — on a 429, pause 30s and retry. If three 429s in a row, exit the session cleanly.
- Still run `--foreground` for the first 1–2 sessions so you can see how fast you're burning allowance before letting it run detached.

### What you see in the morning

```
$ npm run crew -- status my-biz
Session: 2026-04-17 23:04 → 2026-04-17 23:27 (23m, 8 rounds, $2.80)
Status: completed (confidence converged — all agents ≥80%)
Today's plan: projects/my-biz/daily/2026-04-18.md

Top pick: #3 — "Niche newsletter for CrossFit gym owners"
Crew confidence: strategist 88, cto 92, marketer 85, analyst 82
Next step for you: see the 2 checkboxes at bottom of the daily plan.
```

One command, one paragraph, one file to open. That's the morning interface.

## CLI

All commands run from inside the `crew/` sub-package — `cd crew` first. The root repo's scripts (`npm run dev`, `npm run restart`, etc.) are untouched.

```
cd crew

npm install                                  # one-time, crew's own deps

npm run crew -- init <slug>                  # scaffold projects/<slug>/
npm run crew -- run <slug>                   # detached run: default --duration 30m, --rounds 15, --budget $5
npm run crew -- run <slug> --duration 60m    # longer duration (if you want more rounds)
npm run crew -- run <slug> --until 07:00     # wall-clock deadline instead of duration
npm run crew -- run <slug> --rounds 10       # stop after N rounds
npm run crew -- run <slug> --budget 10       # stop at $ cap
npm run crew -- run <slug> --foreground      # don't detach (for debugging)
npm run crew -- status <slug>                # latest daily plan, session state, spend
npm run crew -- stop <slug>                  # kill a running session cleanly
npm run crew -- tail <slug>                  # follow the current session's log
```

Default `run` = "launch detached, run for 30m or $5 spent or 15 rounds, whichever first." That's the one command you type at 11pm.

Everything is file-based. No DB, no server.

## Session persistence per role

Each role gets its **own** `.session-id` file, stored **inside the crew sub-package** at `crew/projects/<slug>/.sessions/<role>.session-id`. Never at the repo root. Never shared with the bot's `.session-id`. Persistence follows the same read/write pattern as `src/ai.ts` but the paths are fully scoped to `crew/`.

Each role needs continuity across rounds, but roles must **not** share a session or they'll bleed personas. The Telegram bot's session stays separate — in fact the bot and the crew can't even see each other's session files.

## Agent permissions

Similar shape to `src/ai.ts` but every path scoped to `crew/`:
- `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`
- `cwd: crew/projects/<slug>/` — each agent's working directory is the project folder inside `crew/`. Agents cannot see `../../src/` or `../../package.json` or the repo's `.claude/` — they're sandboxed to their own project.
- `settingSources: ['project', 'user', 'local']` — with `cwd` scoped to the project folder, "project" settings resolve to `crew/projects/<slug>/.claude/` (if any) rather than the repo root's `.claude/`. We can drop a `crew/.claude/settings.json` later for crew-wide tool configs without touching the root one.
- Allow Read/Edit/Write/Glob/Grep by default. Deny Bash by default except for CTO, and even there scope it.
- **Anthropic API key / credentials**: read from `crew/.env` (not repo root `.env`, which the bot uses). If both files exist they can hold the same key — that's the user's choice — but the crew never reaches into the root `.env`.
