# Auto `git pull` Cron Job — Plan

## Goal
Keep `/root/code/nexo-agent` in sync with `origin/master` automatically, without clobbering any uncommitted local work.

## Behavior

1. `cd` into the repo.
2. Check for pending local changes — both working tree and index.
   - If **dirty** → log and exit cleanly (do nothing).
   - If **clean** → `git fetch` then `git pull --ff-only`.
3. Log every run (timestamp, action taken, outcome) to a rotating log file.
4. Exit non-zero on real errors (network fail, non-fast-forward, etc.) so a future monitoring hook could catch it. "Dirty tree, skipped" is **not** an error — it's expected.

### "Pending local changes" — exact definition
Treat the repo as dirty if **any** of these are true:
- `git status --porcelain` returns any output (modified, staged, untracked non-ignored files).
- Current branch has unpushed commits ahead of its upstream.
- HEAD is detached (we don't know where to pull to — skip).

This is conservative on purpose: we'd rather skip a pull than risk stomping work-in-progress.

### Why `--ff-only`
No merge commits, no surprise rebases. If upstream has diverged from local in a way that can't fast-forward, we want to fail loudly and let a human look, not auto-merge.

## Files to add

```
scripts/
  auto-pull.sh          # the actual script
  README.md             # 1-pager: what it does, how to install, how to uninstall
_research/
  auto-git-pull-cron-plan.md   # this doc
```

Logs go to `/var/log/nexo-agent-auto-pull.log` (or `~/.local/state/nexo-agent/auto-pull.log` if we want to stay in $HOME — decide with user). Rotate via `logrotate` or just cap size inside the script.

## Cron entry

Proposed (tune interval with user):

```
*/10 * * * * /root/code/nexo-agent/scripts/auto-pull.sh >> /var/log/nexo-agent-auto-pull.log 2>&1
```

Every 10 min is a reasonable default — frequent enough to feel "live," infrequent enough that a flaky network blip is noise not signal.

## Cron-specific gotchas to handle in the script

1. **`$PATH` is minimal under cron.** Hard-code `/usr/bin/git` or set PATH at the top of the script.
2. **SSH key access.** The remote is `git@github.com:ellison-projects/nexo-agent.git` (SSH). Cron jobs don't inherit an `ssh-agent` session. Options:
   - Use a deploy key with no passphrase and point `GIT_SSH_COMMAND` at it explicitly, OR
   - Switch the remote to HTTPS with a token in a credential helper.
   - **Open question for user:** which do you prefer? SSH deploy key is cleaner; HTTPS+token is simpler to rotate.
3. **Locking.** If a run takes longer than the interval (slow network), two can overlap. Wrap the body in `flock` on a lockfile so only one runs at a time.
4. **Working directory.** Always `cd` to the repo absolute path — cron's CWD is `$HOME`, not the repo.
5. **Timezone in logs.** Use ISO-8601 with TZ so the log is unambiguous.

## Install / uninstall

Rather than editing `/etc/crontab` by hand, ship two helper commands in `scripts/README.md`:

- **Install:** `(crontab -l 2>/dev/null; echo "*/10 * * * * /root/code/nexo-agent/scripts/auto-pull.sh >> /var/log/nexo-agent-auto-pull.log 2>&1") | crontab -`
- **Uninstall:** `crontab -l | grep -v 'nexo-agent/scripts/auto-pull.sh' | crontab -`

Document both so it's trivial to back out.

## Open questions for the user

1. **Interval** — every 10 min, every hour, every 5 min? Default: 10 min.
2. **Auth** — stick with SSH (need to set up a passphrase-less deploy key readable by the cron user) or switch remote to HTTPS + token?
3. **Log location** — `/var/log/nexo-agent-auto-pull.log` (needs root, which cron already is here) or keep it inside the repo's ignored dir?
4. **Cron user** — run as root (matches current shell) or a dedicated user?
5. **Branch scope** — only auto-pull when on `master`, or on any branch that has a tracking upstream? Default: only `master`, since auto-pulling arbitrary feature branches is surprising.

## Non-goals (explicitly out of scope)

- No auto-restart of the bot / pm2 process on pull. That's a separate concern — a post-pull hook can be added later.
- No auto-install of new `npm` dependencies. Same reason — flag it after we see it working.
- No notification channel (Slack/Telegram) on failure. Log file only for v1.
