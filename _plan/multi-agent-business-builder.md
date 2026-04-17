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
    ├── builder/ROLE.md             # Engineer — designs & builds the product / infra
    ├── marketer/ROLE.md            # Content — TikTok scripts, hooks, posting schedule
    └── analyst/ROLE.md             # Research — comment mining, competitor scans, demand signals
```

The `roles/*/ROLE.md` files are the "personality + job description" for each agent. They get concatenated into that role's system prompt at turn time. Keeping them as Markdown (not inline strings) means you can iterate on them without touching TypeScript.

## The four roles

Mapped directly to what the PDF says the work is:

| Role | Owns | Typical turn output |
|---|---|---|
| **Strategist** (CEO) | `plan.md`, picking the business, 90-day targets, pivots | Updates plan; reconciles conflicts between other roles; picks what ships next |
| **Builder** (Engineer) | Product design, infra, pricing mechanics, pre-sell page | Tech decisions; build tasks; what the human needs to click/sign up for |
| **Marketer** (Content) | TikTok/Reels/Shorts scripts, hooks, posting cadence | Video briefs; 5-video content calendar; cross-post plan |
| **Analyst** (Research) | Comment mining, competitor scans, audience demand signals | "Top 3 demand signals from today's comments"; pricing benchmarks; pivot recommendations |

Start with 4. If it turns out the analyst and strategist overlap too much, collapse to 3.

## Round-robin loop

A **round** is one pass through all roles. A **cycle** is one full day's worth of rounds (default: 1 round/day, configurable).

```
for each role in [strategist, builder, marketer, analyst]:
  1. load brief.md + state/*.md + last N transcripts
  2. prompt the role: "Here's the state. Here's your job. What do you change / add / recommend?"
  3. let the agent use Edit/Write on files under state/ (scoped via cwd)
  4. append its reasoning + file diff summary to transcripts/<timestamp>-<role>.md

then (synthesis step):
  5. Strategist agent runs a final "close the round" turn that reads the other three turns
     and writes state/daily/YYYY-MM-DD.md — the concrete plan for the human tomorrow
```

Why round-robin and not parallel: sequential turns mean each role reacts to the previous role's edits. The Marketer sees what the Builder just decided to ship; the Strategist synthesizes at the end. Parallel runs would race on file edits and produce incoherent plans.

Why Strategist closes the round: matches the PDF's framing — the human's one real job is saying yes/no, and the Strategist's job is to tee up that decision.

## The daily plan contract

Every round ends by writing `state/daily/YYYY-MM-DD.md` with a fixed shape so it's scannable on a phone:

```markdown
# Day <N> of 90 — YYYY-MM-DD

## Current MRR: $X   Pre-orders: N   Followers: N

## What the crew decided today
- <one-line bullets, max 5>

## What YOU need to do (human-in-the-loop)
- [ ] <task> — why: <...>
- [ ] <task> — why: <...>

## What the crew will work on next round
- Strategist: ...
- Builder: ...
- Marketer: ...
- Analyst: ...

## Open questions for you
1. ...
```

If the daily plan ever grows past one screen, we've lost the plot. Enforce that in the synthesis prompt.

## CLI

```
npm run crew -- init <slug>            # scaffold projects/<slug>/ from template
npm run crew -- run <slug>             # run one full round (all 4 roles + synthesis)
npm run crew -- run <slug> --rounds 3  # run N rounds back-to-back
npm run crew -- status <slug>          # print latest daily plan + MRR
```

Everything is file-based. No DB, no server. A cron entry can call `npm run crew -- run <slug>` once a day if we want it fully hands-off.

## Session persistence per role

Each role gets its **own** `.session-id` file (e.g. `projects/<slug>/state/.sessions/strategist.session-id`), persisted the same way `src/ai.ts` does it today. This is critical: each role needs continuity across rounds, but roles must **not** share a session or they'll bleed personas. The Telegram bot's session stays separate.

## Agent permissions

Mirror `src/ai.ts`:
- `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`
- `cwd: projects/<slug>/` — sandbox each agent to its project directory so it can't accidentally edit the repo's source
- `settingSources: ['project', 'user', 'local']` — lets us drop per-role `.claude/settings.json` later if a role needs custom tools (e.g. Analyst gets web fetch, Builder gets shell)
- Allow Read/Edit/Write/Glob/Grep by default. Deny Bash by default except for Builder, and even there scope it.

## What the human does

Matching the PDF's "human in the loop" framing:

1. `npm run crew -- init my-biz` and fill in `brief.md` (idea, budget, constraints, skills).
2. Run one round each morning. Read the daily plan. Do the checkboxed tasks.
3. Update `metrics.md` with real numbers (MRR, pre-orders, follower count, top comments).
4. Record the TikTok the Marketer scripted. Post it. Paste comment exports back into a `state/comments/YYYY-MM-DD.txt` file for the Analyst to chew on next round.
5. Say yes/no on decisions the Strategist teed up.

## Open questions for the user

1. **Number of roles** — 4 (Strategist / Builder / Marketer / Analyst) or collapse to 3? Gut says 4 is worth trying first.
2. **Model per role** — all Sonnet, or give Strategist Opus and the rest Sonnet? Opus everywhere = expensive but probably worth it given the whole premise is "AI is the employee."
3. **Round cadence** — 1 round/day (matches PDF's daily posting rhythm) or run multiple rounds on big days (launch, pivot)? Default 1/day.
4. **Comment ingestion** — for now, human pastes exported comments into a file. Robbie used Apify. Do we wire Apify/TikTok scraping into the Analyst later, or keep it manual to stay simple?
5. **Where does `projects/` live** — inside the repo (gitignored) or outside (e.g. `~/biz/`)? Gitignored-inside is simplest for v1.
6. **Telegram integration** — should the existing bot become the mobile UI for the crew (`/crew status`, `/crew run`, daily plan pushed as a Telegram message)? Probably yes, but as a v2 — ship the CLI first.
7. **TikTok/Stripe/Gumroad credentials** — the agents will propose these actions but the human signs up. Confirmed, or do we want the Builder to have any browser-automation ability at some point?

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
