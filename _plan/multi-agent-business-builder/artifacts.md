# Multi-Agent Business Builder — Artifacts

The files the crew produces and consumes, and what each one is for. This is the interface between the crew and the human.

## The daily plan

Each round's last turn (Strategist) writes `state/daily/YYYY-MM-DD.md`. The Strategist decides what goes in it. Some days that's a ranked Top-10 of ideas. Some days it's a single decision the human needs to make. Some days it's "we're blocked, here's the question." Whatever is most useful.

The only hard constraint is **fit on one phone screen**. If the Strategist can't say it in one screen, the Strategist hasn't figured out what today's answer is yet.

Across the project, the daily files accumulate in `daily/`. Read day 1 + day 7 + day 30 in a row and you see the trajectory.

## The working doc (`working.md`)

One doc. Every agent reads and edits it. It's the brain of the project.

There are **two structural rules**:

1. The top of `working.md` always has a short section called **"Where we are / pick up here"** that any agent can read in 30 seconds to know exactly where the project stands and what the next agent should do. Every agent that takes a turn must leave this section accurate before they finish. That's the handoff primitive — without it, round 20 doesn't know what round 19 did.
2. `working.md` also holds a **"Current top pick"** line — the single business idea the crew is currently evaluating. Whichever agent changes it (or replaces it with a pivot) bumps a version/timestamp. That's the handle each agent's private confidence note is scored against.

### What each agent sees and writes

| File | Every agent reads | Every agent writes |
|---|---|---|
| `brief.md` | yes | no (human-owned) |
| `working.md` | yes | yes (shared) |
| `questions.md` | yes | yes (shared) |
| `notes/<their-role>.md` | yes (just theirs) | yes (private to them) |
| `notes/<other-role>.md` | **no** | no |
| `daily/*` | yes (reference) | only strategist, on round close |

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

## Current top pick (authoritative — used for convergence scoring)
"AI-generated TikTok hooks for Shopify stores"

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

## Day 1 outcome (what "good" looks like)

After one ~30-minute session, `daily/day-1.md` should contain a **ranked top 3 with a clear crew recommendation** — sharp enough that the human can approve #1 and start executing Day 2 in 30 minutes, or redirect to #2/#3 without starting over.

Four parts:

1. **Top 3 contenders (ranked)** — one-line business description for each: customer, price, why it could hit $1K pre-sales. Plus for #2 and #3, a line on "why not #1."
2. **Crew status** — converged on #1 (all 4 ≥80%) or not. If not, name the core disagreement.
3. **Pre-sell hypothesis for #1 only** — customer segment, price, hook angle, pre-sell platform. Enough to post a TikTok and open a Stan Store page.
4. **Human action list for #1** — 3–5 checkboxes doable in 30 minutes. Things only the human can do.

Why top 3 and not top 10: the crew still has to commit. Ranking 10 is diffuse; ranking 3 forces a call. The human gets the single most important decision (which business) without the crew being wishy-washy.

Why pre-sell hypothesis and actions for #1 only: if the human wants #2 or #3, they edit `brief.md` with "go with #2" and trigger another run. The crew pivots from there rather than producing three parallel plans. Simpler and keeps the commitment sharp.

Sketch:

```markdown
# Day 1 of 90 — 2026-04-18

## Crew: CONVERGED on #1 (all 4 roles ≥80%)

## Top 3 contenders

### #1 — RECOMMENDED: AI-generated TikTok hook scripts for Shopify stores
$29/mo. Customer: Shopify stores with <10K followers. 2-day MVP via Gumroad + OpenAI API.
Why #1: tight niche, fast build, clear pre-sell hook.

### #2 — AI market-research reports for indie SaaS founders
$99 one-time. Customer: founders doing discovery. 3-day build.
Why not #1: longer feedback loop, harder to pre-sell without a demo.

### #3 — AI cold-email sequences for B2B consultants
$49/mo. Customer: solo consultants. Easy build, crowded space.
Why not #1: established competitors, differentiation unclear.

## Pre-sell hypothesis for #1
- Customer: Shopify store owners with <10K followers struggling with content
- Price: $29/mo founding member, $10 refundable pre-sell deposit
- Hook angle: "I made an AI write 30 days of viral hooks for your store"
- Platform: Stan Store for pre-sell, TikTok for traffic

## What to do today (if you approve #1)
- [ ] Create TikTok account (@<handle proposed by marketer>)
- [ ] Sign up for Stan Store, create pre-sell product
- [ ] Record + post the first TikTok (script in working.md)
- [ ] Answer the 2 questions in working.md's "Open for human" section

## Want #2 or #3 instead?
Add `decision: go with #2` (or #3) to brief.md and trigger another run.
Or drop your own direction in brief.md — the crew will pivot from there.
```

**Sad path** — if the crew didn't converge on #1 (ran out of budget / rounds / time), the daily still shows top 3 ranked, says "NOT CONVERGED" up top, and surfaces the single unresolved concern. Human can approve the best-effort #1 anyway, or address the concern in `brief.md` and re-run.

Day N's outcome shifts as the project progresses — Day 5 might be "pre-sell page is drafted, here's the final TikTok 2 script" — but the structure stays the same: crew commits to a recommendation, human approves or redirects.

## Tracking progress

Three signals, in order of importance:

1. **Is something real happening in the world?** Did a TikTok get posted? Did a pre-order come in? If yes, `working.md`'s Metrics section moves. If a week goes by and it hasn't, the crew is spinning — rewrite the brief or role identities.
2. **Daily files.** Read `daily/day-1.md`, `daily/day-7.md`, `daily/day-30.md` in a row. If the trajectory is muddled, the Strategist's synthesis isn't working.
3. **Working doc history.** `git log projects/<slug>/working.md` shows the arc of what changed and when. `git diff` between two commits shows exactly what pivoted.

Transcripts are forensic — only open them when something went wrong and you need to know why.

## What the human does

Matching the PDF's "human in the loop" framing:

1. `npm run crew -- init my-biz` and fill in `brief.md` (idea, budget, constraints, skills).
2. At ~11pm: `npm run crew -- run my-biz` on the VPS. 30 minutes later it's done. Morning: read the daily plan, do the checkboxed tasks.
3. Update the Metrics section at the top of `working.md` with real numbers (MRR, pre-orders, follower count).
4. Record the TikTok the Marketer scripted. Post it. Paste comment exports into `projects/<slug>/comments/YYYY-MM-DD.txt` for the Analyst to chew on next session.
5. Say yes/no on decisions the Strategist teed up. You can edit `working.md` directly if it's easier — just say "HUMAN:" before anything you add so the crew knows it's from you.
