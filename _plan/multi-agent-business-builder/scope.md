# Multi-Agent Business Builder — Scope

What's decided, what's still open, what's explicitly out, and how to build it in order.

## Decisions & open questions

### Decided

- **4 roles**: Strategist / CTO / Marketer / Analyst.
- **Model**: Opus for all four.
- **Run shape**: 11pm trigger → detached process → ~30 minutes of rounds back-to-back. Each round: all 4 agents take a turn, each challenging prior turns before contributing. Stops at `--duration 30m` / `--budget $5` / `--rounds 15` / convergence, whichever first.
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
