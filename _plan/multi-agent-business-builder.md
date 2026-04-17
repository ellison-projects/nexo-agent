# Multi-Agent Business Builder — Plan

## Goal

Turn this repo into a launcher for a small "virtual team" of Claude Agent SDK agents that work together on a single business idea with one objective: **hit $1,000 MRR within 90 days**, using the Robbie/Ron playbook from `docs/How to Get an AI Agent to Make Money for You.pdf` as the operating manual.

You (the human) pick the idea (or have the team pick one). The agents round-robin through daily cycles — each reads the shared project state, contributes from its role, and at the end of each round a daily plan is emitted. You act as the human-in-the-loop: click buttons, enter credentials, record TikToks, and give yes/no on anything with real-world consequences.

## What already exists vs. what's new

The existing bot (`src/index.ts`, `src/ai.ts`, `src/telegram.ts`) is a single-agent Telegram responder. It stays untouched. This feature is a **separate entry point** — new files under `src/crew/` and a new `npm run crew` script. They share one thing: the same `@anthropic-ai/claude-agent-sdk` dependency and the same `settingSources: ['project', 'user', 'local']` pattern, so roles can drop their own `.claude/` config if we want later.

## Shape of the system

```
repo root/
├── projects/                       # one subfolder per business experiment (gitignored or user-owned)
│   └── <slug>/                     # e.g. projects/fiverr-swot/
│       ├── brief.md                # human-written: what the business is, budget, constraints
│       ├── state/
│       │   ├── plan.md             # the living 90-day plan (agents edit this)
│       │   ├── daily/YYYY-MM-DD.md # one file per round — the day's plan
│       │   ├── decisions.md        # append-only log of decisions + who proposed them
│       │   ├── metrics.md          # MRR, pre-orders, followers, churn — human-updated
│       │   └── backlog.md          # open tasks, blockers, questions for the human
│       └── transcripts/            # raw per-turn agent output, one file per turn
├── src/crew/
│   ├── run.ts                      # CLI entrypoint: `npm run crew -- --project <slug>`
│   ├── roles.ts                    # role registry (name, system prompt, output contract)
│   ├── turn.ts                     # runs a single agent turn against the project state
│   ├── round.ts                    # round-robin loop + synthesis into daily plan
│   └── state.ts                    # read/write helpers for the project state files
└── roles/
    ├── strategist/ROLE.md          # CEO — owns the plan, picks direction, reads market signals
    ├── cto/ROLE.md                 # CTO — tech strategy, feasibility, code; peer to Strategist
    ├── marketer/ROLE.md            # Content — TikTok scripts, hooks, posting schedule
    └── analyst/ROLE.md             # Research — comment mining, competitor scans, demand signals
```

The `roles/*/ROLE.md` files are the "personality + job description" for each agent. They get concatenated into that role's system prompt at turn time. Keeping them as Markdown (not inline strings) means you can iterate on them without touching TypeScript.

## The four roles

Mapped directly to what the PDF says the work is:

| Role | Owns | Typical turn output |
|---|---|---|
| **Strategist** (CEO) | `plan.md`, picking the business, 90-day targets, pivots | Updates plan; reconciles conflicts between other roles; picks what ships next |
| **CTO** | Technical strategy + code. Feasibility calls, build-vs-buy, where code gives leverage, tech-stack picks, and actually writing the code when it's code-time | Pushes back on Strategist when an idea is infeasible or when code could 10x it; tech roadmap; commits to `build/`; picks libraries/platforms |
| **Marketer** (Content) | TikTok/Reels/Shorts scripts, hooks, posting cadence | Video briefs; 5-video content calendar; cross-post plan |
| **Analyst** (Research) | Comment mining, competitor scans, audience demand signals | "Top 3 demand signals from today's comments"; pricing benchmarks; pivot recommendations |

The CTO is a peer to the Strategist, not a downstream executor. The Strategist says "what business"; the CTO says "here's the engineering leverage that changes the shape of that business" — e.g., "a scraper would turn this from a service into a product," or "don't build this, Gumroad already does it." No-code platform signups (Stripe dashboard, Discord, Skool) still stay with the human per the PDF; the CTO picks the platform, the human signs up.

## Round-robin loop

A **round** is one pass through all four roles plus a synthesis step. A **session** is however many rounds run back-to-back before the command exits — typically one overnight batch.

```
for each role in [strategist, cto, marketer, analyst]:
  1. load brief.md + state/*.md + last N transcripts
  2. prompt the role: "Here's the state. Here's your job. What do you change / add / recommend?"
  3. let the agent use Edit/Write on files under state/ (scoped via cwd)
  4. append its reasoning + file diff summary to transcripts/<timestamp>-<role>.md

then (synthesis step):
  5. Strategist agent runs a "close the round" turn that reads the other three turns
     and rewrites state/daily/YYYY-MM-DD.md — the current best Top-10
```

Each round overwrites the day's plan in place. If the session crashes at round 17, you still have round 16's plan waiting for you in the morning — it's not worse than no plan, it's just not fully cooked.

Why round-robin and not parallel: sequential turns mean each role reacts to the previous role's edits. The Marketer sees what the CTO just decided to ship; the Strategist synthesizes at the end. Parallel runs would race on file edits and produce incoherent plans.

Why Strategist closes the round: matches the PDF's framing — the human's one real job is saying yes/no, and the Strategist's job is to tee up that decision.

## Overnight run mode (primary use case)

The intended flow: **11pm you SSH in, start the crew, disconnect, wake up to a finished Top-10.** Everything below flows from that.

### Detachment

`npm run crew -- run <slug> --until 07:00` launches through pm2 as a one-off process (`pm2 start ... --no-autorestart`), which means it survives SSH disconnect and shows up in `pm2 list` for inspection. A second invocation while one is already running refuses to start — same single-instance rule as the bot.

Alternative if pm2 feels heavy for a one-off: `nohup npm run crew ... > log 2>&1 &` in a `tmux` session. Whichever we pick, the CLI abstracts it: user always types `npm run crew -- run`.

### Stop conditions

Whichever triggers first:

- `--until HH:MM` — wall-clock deadline (default: 07:00 local)
- `--rounds N` — hard cap on round count (default: 30)
- `--budget $X` — token-cost ceiling (default: $20/session); tallied from the SDK's usage events
- Converged: 3 rounds in a row where the Strategist's synthesis flags "no material change to Top-10"

All four are ORed. Any one trips, session exits clean, final daily plan stays on disk.

### Why rounds need to evolve (the big design rule)

If every round is just "re-propose the top 10," round 20 looks identical to round 2 and you've burned $15 for nothing. Each round must do *different work* than the last. The role prompts enforce this:

- **Strategist**: round 1 proposes; rounds 2+ *stress-test* the current top 3 ("what would have to be true for #1 to fail by day 30?")
- **CTO**: round 1 gives feasibility scores; rounds 2+ sketch implementation for the top 3 and let that refine the ranking
- **Marketer**: round 1 drafts hooks; rounds 2+ writes the actual 30-second TikTok scripts for the top 3 and reads which script "wants" to be made — that feeds ranking
- **Analyst**: round 1 surveys competitors; rounds 2+ goes deep on the top 3 — pricing, existing solutions, demand evidence

By round ~10, the top 3 have been attacked from four angles. That's the whole point of running overnight vs. running once.

### Cost to expect

Rough back-of-napkin: 4 roles × ~30s Opus turn × 20 rounds ≈ $5–$15/session depending on context growth. The `--budget $X` cap is the hard guardrail. Worth logging cumulative spend in `state/session-log.md` after every round so you can see where it went.

### What you see in the morning

```
$ npm run crew -- status my-biz
Session: 2026-04-17 23:04 → 2026-04-18 06:47 (7h43m, 22 rounds, $11.80)
Status: completed (hit --until)
Today's plan: projects/my-biz/state/daily/2026-04-18.md

Top pick: #3 — "Niche newsletter for CrossFit gym owners"
Next step for you: see the 2 checkboxes at bottom of the daily plan.
```

One command, one paragraph, one file to open. That's the morning interface.

## The daily plan contract

Each role takes its turn, then the Strategist closes the round by writing `state/daily/YYYY-MM-DD.md`. The core artifact is a **ranked Top-10** — the crew's best options for today, with rationale. You pick 1–3 to execute.

What the Top-10 *is* changes with the project phase:

| Phase | What the Top-10 ranks |
|---|---|
| Week 1 — Discovery | Business ideas the crew thinks can hit $1K MRR in 90 days |
| Week 2 — Validation | TikTok hooks to test / demand-signal experiments |
| Week 3 — Pre-sell | Product features, pricing tiers, pre-sell page angles |
| Week 4+ — Build/fulfill | Shipped features, growth experiments, pivot candidates, content angles |

Fixed shape so it's scannable on a phone:

```markdown
# Day <N> of 90 — YYYY-MM-DD

## Current MRR: $X   Pre-orders: N   Followers: N

## Top 10 Plays (ranked)
1. **<title>** — score: X/10 — proposed by: <role>
   why it's #1: <one line>
   what it costs you: <time/money/risk>
2. **<title>** — score: X/10 — proposed by: <role>
   ...
(through 10)

## The crew's pick for today
The Strategist recommends #<N>. Here's why over #<M>: <one line>.

## What YOU need to do to run the pick
- [ ] <task>
- [ ] <task>

## Open questions for you
1. ...
```

Ranking rules for the Strategist's synthesis:
- Score 1–10 on a single axis: *"probability this gets us closer to $1K MRR in the next 7 days."*
- Each role must propose at least 2 ideas; Strategist can add its own and must rank all of them.
- No ties. Force a call.
- Ideas carry forward — if idea #4 from yesterday still makes sense, it can rerank today; if it got stale, it drops off. `plan.md` tracks which ideas have been tried, shipped, or killed.

If the daily plan grows past one phone screen above the Top-10 list, we've lost the plot. Enforce that in the synthesis prompt.

## CLI

```
npm run crew -- init <slug>                          # scaffold projects/<slug>/
npm run crew -- run <slug>                           # overnight run: default --until 07:00, --budget $20
npm run crew -- run <slug> --until 07:00             # stop at wall-clock time
npm run crew -- run <slug> --rounds 10               # stop after N rounds
npm run crew -- run <slug> --budget 15               # stop at $ cap
npm run crew -- run <slug> --foreground              # don't detach (for debugging)
npm run crew -- status <slug>                        # latest daily plan, session state, spend
npm run crew -- stop <slug>                          # kill a running session cleanly
npm run crew -- tail <slug>                          # follow the current session's log
```

Default `run` = "launch detached, run until 07:00 or $20 spent or 30 rounds, whichever first." That's the one command you type at 11pm.

Everything is file-based. No DB, no server.

## Session persistence per role

Each role gets its **own** `.session-id` file (e.g. `projects/<slug>/state/.sessions/strategist.session-id`), persisted the same way `src/ai.ts` does it today. This is critical: each role needs continuity across rounds, but roles must **not** share a session or they'll bleed personas. The Telegram bot's session stays separate.

## Agent permissions

Mirror `src/ai.ts`:
- `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`
- `cwd: projects/<slug>/` — sandbox each agent to its project directory so it can't accidentally edit the repo's source
- `settingSources: ['project', 'user', 'local']` — lets us drop per-role `.claude/settings.json` later if a role needs custom tools (e.g. Analyst gets web fetch, CTO gets shell)
- Allow Read/Edit/Write/Glob/Grep by default. Deny Bash by default except for CTO, and even there scope it.

## What the human does

Matching the PDF's "human in the loop" framing:

1. `npm run crew -- init my-biz` and fill in `brief.md` (idea, budget, constraints, skills).
2. Run one round each morning. Read the daily plan. Do the checkboxed tasks.
3. Update `metrics.md` with real numbers (MRR, pre-orders, follower count, top comments).
4. Record the TikTok the Marketer scripted. Post it. Paste comment exports back into a `state/comments/YYYY-MM-DD.txt` file for the Analyst to chew on next round.
5. Say yes/no on decisions the Strategist teed up.

## Open questions for the user

1. ~~**Number of roles**~~ — **decided: 4** (Strategist / CTO / Marketer / Analyst).
2. ~~**Model per role**~~ — **decided: Opus for all four.** The whole premise is "AI is the employee" — no point picking a cheaper brain for the employees.
3. ~~**Round cadence**~~ — **decided: 1 round/day.** Each role takes a turn, Strategist closes with the Top-10, commit, done. Multiple rounds allowed on-demand via `--rounds N` but 1/day is the rhythm.
4. **Comment ingestion** — when you post TikToks, comments are where demand signal lives (the PDF's Step 4 is the whole business). "Ingestion" = how those comments get into the Analyst's hands. Two options: (a) you manually paste/export them into `projects/<slug>/state/comments/YYYY-MM-DD.txt` each day, or (b) we wire in Apify (Robbie's tool) to scrape them automatically. Start with manual to stay simple; add Apify once you have enough videos posting to make it worth it.
5. ~~**Where does `projects/` live**~~ — **decided: inside the repo, gitignored.** One less thing to configure.
6. **Telegram integration** — should the existing bot become the mobile UI for the crew (`/crew status`, `/crew run`, daily plan pushed as a Telegram message)? Probably yes, but as a v2 — ship the CLI first.
7. **TikTok/Stripe/Gumroad credentials** — the agents will propose these actions but the human signs up. Confirmed, or do we want the CTO to have any browser-automation ability at some point?

## Non-goals (for v1)

- No real browser automation. Agents propose actions; human clicks.
- No payment integration. Stripe/Gumroad is the human's responsibility.
- No TikTok/Instagram/YouTube API posting. The Marketer writes the script; the human records & posts.
- No parallel rounds. Strictly sequential.
- No web UI. CLI + Markdown files only.
- No multi-project orchestration. One project per run.

## Build order (suggested)

1. `projects/` template + `brief.md` schema + state files scaffold.
2. `roles/*/ROLE.md` — start with rough drafts of each role's mandate; iterate after first real run.
3. `src/crew/state.ts` — read/write helpers, session persistence per role.
4. `src/crew/turn.ts` — run one role for one turn.
5. `src/crew/round.ts` — round-robin + synthesis.
6. `src/crew/run.ts` + `package.json` script.
7. One end-to-end dry run against a fake `brief.md` to see what the daily plan actually looks like.
8. **Iterate on the role prompts** based on what round 1 produces — this is where most of the quality will come from, not the code.

## Success criteria for v1

You run `npm run crew -- run my-biz` once per day for a week. At the end of the week:
- You have 7 daily plans in `state/daily/`.
- `plan.md` has evolved meaningfully (not just restated itself).
- At least one actual thing exists in the real world because of a daily plan — a Fiverr listing, a TikTok posted, a Gumroad page, a pre-order. Something.

If after a week nothing real exists, the problem is the role prompts or the brief, not the code. Rewrite the prompts and run another week.
