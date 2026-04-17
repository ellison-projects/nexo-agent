# Multi-Agent Business Builder — Plan

## Goal

Turn this repo into a launcher for a small "virtual team" of Claude Agent SDK agents that work together on a single business idea with one objective: **collect $1,000 in pre-sales within 90 days**, using the Robbie/Ron playbook from `docs/How to Get an AI Agent to Make Money for You.pdf` as the operating manual.

Pre-sales (not MRR) is the primary goal because it's concrete, happens on a specific day, and gives the crew a clean kill/pivot signal. Robbie had $6,170 in pre-sales by day 10 — $1K is the "minimum viable validation" threshold. If the crew can't get $1K in pre-sales by day 90, the business idea was wrong and we pivot. If it clears that bar, the crew can stretch toward MRR as a follow-on goal.

You (the human) provide the goal and constraints. The agents decide everything else. They round-robin through rounds — each reads the shared project state, decides for itself what to do, writes it down. At the end of each round the Strategist commits something useful to the daily plan. You act as the human-in-the-loop: click buttons, enter credentials, record TikToks, and give yes/no on anything with real-world consequences.

## Day 1 vs. every day after

The crew runs in one of two modes, auto-detected by whether `working.md` has content yet:

- **Day 1 (kickoff).** Fresh project. The Strategist's first turn is effectively: *"Read `brief.md`. This is the goal and these are the constraints. Figure out a direction. Set up `working.md` so the rest of the crew can pick up from it."* That kickoff prompt is the human's only "direct" instruction. After it, we're off.
- **Day N (continuation).** `working.md` already exists. Every agent's prompt becomes: *"Read `working.md`'s 'Where we are' section. Take your turn. Update it before finishing."* `brief.md` is reference only. The crew runs on its own momentum.

This is what the user's job shrinks to: fill out `brief.md` once, trigger the first run, then update metrics and do the checkbox tasks. No ongoing human-in-the-loop prompting.

## Design principle: give the goal, trust the agents

The whole lesson of the PDF is that Robbie didn't tell Ron what business to build — he gave Ron a budget and a deadline and got out of the way. Same rule here. Every agent, every turn, gets exactly two things:

1. **The high-level goal** — from `brief.md`. $1K in pre-sales in 90 days, the human's constraints, skills, budget.
2. **Where we are right now** — the state files (`plan.md`, `daily/*`, `decisions.md`, `metrics.md`, `backlog.md`, `questions.md`, any pasted `comments/*`).

Plus a one-liner identifying which role they are ("you are the CTO"). That's it. No turn checklists, no mandated output shapes, no scoring rubrics, no "round 1 does X, round 2 does Y" scripts.

If a section of this plan tells an agent *what* to produce on turn N rather than providing the goal + state, that section is wrong and should be cut. The only infrastructure constraints are:
- The Strategist's last turn of each round writes something to `daily/YYYY-MM-DD.md` so the human has something to wake up to.
- If `questions.md` has a pending item addressed to you, deal with it on your turn.

Everything else — what to work on, what artifact shape fits today, whether to challenge prior work, when to pivot — the agent decides.

## What already exists vs. what's new

The existing bot (`src/index.ts`, `src/ai.ts`, `src/telegram.ts`) is a single-agent Telegram responder. It stays untouched. This feature is a **separate entry point** — new files under `src/crew/` and a new `npm run crew` script. They share one thing: the same `@anthropic-ai/claude-agent-sdk` dependency and the same `settingSources: ['project', 'user', 'local']` pattern, so roles can drop their own `.claude/` config if we want later.

## Shape of the system

```
repo root/
├── projects/                       # one subfolder per business experiment (gitignored or user-owned)
│   └── <slug>/                     # e.g. projects/fiverr-swot/
│       ├── brief.md                # human input: goal + constraints (written once, rarely edited)
│       ├── working.md              # THE single working doc — all agents read & edit this
│       ├── questions.md            # async cross-role question queue (see "Escape hatch")
│       ├── daily/YYYY-MM-DD.md     # round-closing snapshot for the human (phone-sized)
│       ├── comments/YYYY-MM-DD.txt # human-pasted TikTok comments (when applicable)
│       ├── session-log.md          # per-round stamp: rounds, wall-clock, token spend
│       └── transcripts/            # raw per-turn agent output (forensic, not working state)
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

Each role is an **identity** (a lens), not a job description:

| Role | The lens |
|---|---|
| **Strategist** (CEO) | Is this the right business? Are we closer to $1K in pre-sales than yesterday? What should we stop doing? |
| **CTO** | What would engineering leverage change about this business? What's feasible vs. fantasy? Build, buy, or skip? |
| **Marketer** | Would a human stop scrolling for this? Where's the audience, what's the hook, what's the story? |
| **Analyst** | What does the evidence say? Who else is doing this, at what price, with what result? What's the market actually telling us? |

That's the whole role definition. `roles/<role>/ROLE.md` holds the same thing in system-prompt form — short, identity-focused, no turn-by-turn instructions. The Strategist closes the round (by convention so the human has a single synthesizer), but they're all peers.

## Round-robin loop

A **round** is one pass through all four roles plus a synthesis step. A **session** is however many rounds run back-to-back before the command exits — typically one overnight batch.

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

## The daily plan

Each round's last turn (Strategist) writes `state/daily/YYYY-MM-DD.md`. The Strategist decides what goes in it. Some days that's a ranked Top-10 of ideas. Some days it's a single decision the human needs to make. Some days it's "we're blocked, here's the question." Whatever is most useful.

The only hard constraint is **fit on one phone screen**. If the Strategist can't say it in one screen, the Strategist hasn't figured out what today's answer is yet.

Across the project, the daily files accumulate in `daily/`. Read day 1 + day 7 + day 30 in a row and you see the trajectory.

## The working doc (`working.md`)

One doc. Every agent reads and edits it. It's the brain of the project.

There's exactly **one structural rule**: the top of `working.md` always has a short section called **"Where we are / pick up here"** that any agent can read in 30 seconds to know exactly where the project stands and what the next agent should do. Every agent that takes a turn must leave this section accurate before they finish. That's the handoff primitive — without it, round 20 doesn't know what round 19 did.

Below that section, the agents decide what lives in the doc. Likely sections that emerge naturally: the live 90-day plan, a decisions log, metrics, ideas, blockers for the human, open threads. But we don't prescribe them — if the crew decides a different structure works better, fine.

Sketch of what `working.md` might look like by round 20:

```markdown
# Working doc — my-biz

## Where we are / pick up here
Round 20, 2026-04-18 05:12. We're locked on "AI-generated TikTok
hooks for Shopify stores" as the business. Pre-sell page is drafted
(see section below). CTO is next — needs to finalize Stripe Payment
Link integration. Marketer already wrote the launch video script.
Blocker: human hasn't confirmed $29 price point yet (question in
questions.md).

## The 90-day plan
...

## Decisions
- 2026-04-17 pivoted from SWOT to TikTok hooks — Strategist, round 8
- ...

## Metrics (human-updated)
MRR: $0   Pre-orders: 0   TikTok followers: 0

## Open for the human
- [ ] Confirm $29 price point
- [ ] Sign up for Stripe
- [ ] Record launch TikTok (script in "Content" section below)

## (other sections as the crew sees fit)
```

## Cold start: what happens the first time you run this

You just filled out `brief.md` and typed `npm run crew -- run my-biz`. The Strategist is about to take turn 1 of round 1.

**What it knows going in:**

1. **The goal** — full contents of `brief.md` (your $1K target, budget, skills, constraints).
2. **The state** — on turn 1, just `working.md` with an empty "Where we are" section and nothing else. Everything else (daily/, comments/, questions.md) is empty too.
3. **Its identity** — one-line system prompt: "You are the Strategist. Your lens: is this the right business? Are we closer to the goal than yesterday? What should we stop doing?"
4. **The playbook** — the PDF is accessible as reference material.
5. **Round context** — "turn 1 of round 1 of a fresh project."

**What it likely does** (not mandated):

- Writes a first pass of the 90-day plan into `working.md`
- Fills in the "Where we are / pick up here" section so the CTO knows where to start
- Maybe opens a question in `questions.md` for the CTO/Marketer/Analyst
- Maybe adds a "Open for the human" section with clarifying questions

**What it definitely does** (infra):

- A transcript at `transcripts/<timestamp>-strategist.md` with its reasoning + file diff
- An entry in `session-log.md` with round/turn/token spend

Then CTO's turn opens `working.md`, reads "Where we are," takes its turn, updates "Where we are" before finishing. Same for Marketer. Same for Analyst. Then Strategist's round-closing turn writes `daily/<today>.md` — a phone-sized snapshot for you — and updates "Where we are" one more time. Round 2 starts from that state.

## Tracking progress

Three signals, in order of importance:

1. **Is something real happening in the world?** Did a TikTok get posted? Did a pre-order come in? If yes, `working.md`'s Metrics section moves. If a week goes by and it hasn't, the crew is spinning — rewrite the brief or role identities.
2. **Daily files.** Read `daily/day-1.md`, `daily/day-7.md`, `daily/day-30.md` in a row. If the trajectory is muddled, the Strategist's synthesis isn't working.
3. **Working doc history.** `git log projects/<slug>/working.md` shows the arc of what changed and when. `git diff` between two commits shows exactly what pivoted.

Transcripts are forensic — only open them when something went wrong and you need to know why.

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
2. At ~11pm: `npm run crew -- run my-biz` on the VPS, disconnect SSH. Morning: read the daily plan, do the checkboxed tasks.
3. Update the Metrics section at the top of `working.md` with real numbers (MRR, pre-orders, follower count).
4. Record the TikTok the Marketer scripted. Post it. Paste comment exports into `projects/<slug>/comments/YYYY-MM-DD.txt` for the Analyst to chew on next session.
5. Say yes/no on decisions the Strategist teed up. You can edit `working.md` directly if it's easier — just say "HUMAN:" before anything you add so the crew knows it's from you.

## Decisions & open questions

### Decided

- **4 roles**: Strategist / CTO / Marketer / Analyst.
- **Model**: Opus for all four.
- **Run shape**: 11pm trigger → detached process → many rounds back-to-back overnight. Each round: all 4 agents take a turn, each challenging prior turns before contributing. Stops at `--until 07:00` / `--budget $20` / `--rounds 30` / convergence, whichever first.
- **`projects/` location**: inside the repo, gitignored.
- **Comment ingestion (v1)**: manual — you paste TikTok comments into `projects/<slug>/comments/YYYY-MM-DD.txt` before triggering the run. Apify integration is a v2 concern.
- **Single working doc**: instead of multiple separate state files (`plan.md` / `decisions.md` / `metrics.md` / `backlog.md`), everything lives in one `working.md` per project, with a mandatory "Where we are / pick up here" section at the top that every agent updates before finishing its turn. `questions.md` and `daily/*.md` stay separate because they serve different purposes (cross-role protocol, human-facing snapshot).
- **Round-robin, not parallel**: all 4 agents run sequentially, one turn at a time, with a `questions.md` escape hatch for cross-role clarifying questions. Parallel-with-async-messaging was considered and rejected for v1 — it buys you coordination complexity (file races, deadlocks, runaway chatter, non-deterministic replay) against a benefit the CHALLENGE beat already provides. Revisit only if `questions.md` piles up unresolved round-over-round.

### Still open

1. **Telegram integration** — should the existing bot become the mobile UI for the crew (`/crew status`, `/crew run`, daily plan pushed as a Telegram message)? Probably yes, but as v2 — ship the CLI first.
2. **Browser automation for CTO** — v1 it's strict "propose, human executes." Worth revisiting once we see where the bottleneck actually is.
3. **Convergence signal** — how exactly does Strategist declare "no material change"? Heuristic: same top 3 in same order for 3 consecutive rounds. Good enough for v1 or too strict?

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
