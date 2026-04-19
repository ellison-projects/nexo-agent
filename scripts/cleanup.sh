#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Treat ecosystem.config.cjs as the source of truth: any pm2 app whose name
# isn't in it gets pruned (catches renamed zombies like `telegram-bot`), and
# for apps that *are* in it, extra entries past the oldest get pruned too.
# Prints pm_ids to stdout; explanations to stderr so the user sees what/why.
ids_to_delete="$(
  pm2 jlist | node -e '
    const procs = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const known = new Set(require("./ecosystem.config.cjs").apps.map(a => a.name));
    const seen = new Set();
    const dupes = [];
    for (const p of procs.sort((a, b) => a.pm_id - b.pm_id)) {
      if (!known.has(p.name)) {
        console.error(`Unknown pm2 app "${p.name}" (pm_id=${p.pm_id}) — not in ecosystem.config.cjs, will delete`);
        dupes.push(p.pm_id);
      } else if (seen.has(p.name)) {
        console.error(`Duplicate of "${p.name}" (pm_id=${p.pm_id}) — will delete`);
        dupes.push(p.pm_id);
      } else {
        seen.add(p.name);
      }
    }
    console.log(dupes.join(" "));
  '
)"

if [ -z "$ids_to_delete" ]; then
  echo "No pm2 duplicates or unknown apps found."
  pm2 status
  exit 0
fi

echo "Deleting pm2 ids: $ids_to_delete"
# shellcheck disable=SC2086
pm2 delete $ids_to_delete
pm2 save >/dev/null
pm2 status
