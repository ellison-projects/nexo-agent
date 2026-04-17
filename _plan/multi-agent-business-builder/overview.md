# Multi-Agent Business Builder — Overview

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

The existing bot (`src/index.ts`, `src/ai.ts`, `src/telegram.ts`) is a single-agent Telegram responder. **It must not be affected by this feature at all.** That means:

- No edits to the root `package.json`, `tsconfig.json`, or `ecosystem.config.cjs`.
- No edits to anything under `src/`.
- No touching `.session-id` (the bot's session state).
- No shared `node_modules/` — the crew installs its own.
- No root `npm run crew` passthrough — the crew is invoked from inside `crew/`.
- No reading or writing outside `crew/`. Every agent's `cwd`, `.session-id`, `.claude/` config, `.env`, and project state lives inside the sub-package. An agent can't see the bot's code, the bot's session, or the repo-root `.claude/`.

This feature lives entirely in a **separate sub-package** at `crew/` with its own `package.json`, `tsconfig.json`, and `node_modules/`. You can delete the entire `crew/` folder at any time and the bot keeps working exactly as it does today.

Shared between bot and crew: only the repo itself (so both are version-controlled together) and the `docs/` folder (crew reads the PDF at `../docs/...`). Nothing else.

## Shape of the system

```
repo root/
├── package.json                    # existing bot — unchanged
├── src/                            # existing bot — unchanged
├── ecosystem.config.cjs            # existing bot's pm2 config — unchanged
├── docs/
│   └── How to Get an AI Agent...pdf  # referenced by crew via ../docs/
├── _plan/
└── crew/                           # the sub-package — self-contained
    ├── package.json                # crew's own deps + npm scripts
    ├── tsconfig.json
    ├── ecosystem.config.cjs        # crew's own pm2 config (for detached runs)
    ├── src/
    │   ├── run.ts                  # CLI entrypoint
    │   ├── roles.ts                # role registry
    │   ├── turn.ts                 # runs a single agent turn
    │   ├── round.ts                # round-robin loop + synthesis
    │   └── state.ts                # read/write helpers for project state
    ├── roles/
    │   ├── strategist/ROLE.md      # CEO — picks direction, reads market signals
    │   ├── cto/ROLE.md             # CTO — tech strategy, feasibility, code
    │   ├── marketer/ROLE.md        # Content — TikTok scripts, hooks, posting
    │   └── analyst/ROLE.md         # Research — comments, competitors, demand
    └── projects/                   # one folder per business experiment (gitignored)
        └── <slug>/                 # e.g. crew/projects/fiverr-swot/
            ├── brief.md                # human input: goal + constraints (written once, rarely edited)
            ├── working.md              # shared working doc — all agents read & edit this
            ├── questions.md            # shared async cross-role question queue
            ├── notes/
            │   ├── strategist.md       # PRIVATE — strategist's running notes & confidence scores
            │   ├── cto.md              # PRIVATE — cto's running notes
            │   ├── marketer.md         # PRIVATE — marketer's running notes
            │   └── analyst.md          # PRIVATE — analyst's running notes
            ├── daily/YYYY-MM-DD.md     # round-closing snapshot for the human (phone-sized)
            ├── comments/YYYY-MM-DD.txt # human-pasted TikTok comments (when applicable)
            ├── session-log.md          # per-round stamp: rounds, wall-clock, token spend
            └── transcripts/            # raw per-turn agent output (forensic, not working state)
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
