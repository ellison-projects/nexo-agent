# Multi-Agent Business Builder — Plan

A launcher for a small "virtual team" of Claude Agent SDK agents that work together on a single business idea, targeting **$1,000 in pre-sales within 90 days**. The human fills out `brief.md` once, triggers a nightly 30-minute run, and does the checkboxed tasks in the morning.

Split into four files:

- **[overview.md](overview.md)** — the goal, the design principle ("give the goal, trust the agents"), how the crew is kept isolated from the existing Telegram bot, the repo layout, and the four roles.
- **[runtime.md](runtime.md)** — the round-robin loop, `questions.md` escape hatch, stop conditions, confidence-based convergence, cost rails, CLI surface, per-role session persistence, and agent permissions.
- **[artifacts.md](artifacts.md)** — the daily plan, `working.md` and its "Where we are" handoff section, cold start, Day 1 "good" outcome, progress tracking, and what the human actually does.
- **[scope.md](scope.md)** — decided / still-open questions, v1 non-goals, suggested build order, success criteria.
