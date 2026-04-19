#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Find duplicate pm2 app names (same name, >1 pm2 entry) and print the pm_ids
# of the extras to delete, keeping the oldest (lowest pm_id) of each name.
ids_to_delete="$(
  pm2 jlist | node -e '
    const procs = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const seen = new Set();
    const dupes = [];
    for (const p of procs.sort((a, b) => a.pm_id - b.pm_id)) {
      if (seen.has(p.name)) dupes.push(p.pm_id);
      else seen.add(p.name);
    }
    console.log(dupes.join(" "));
  '
)"

if [ -z "$ids_to_delete" ]; then
  echo "No duplicate pm2 processes found."
  pm2 status
  exit 0
fi

echo "Deleting duplicate pm2 ids: $ids_to_delete"
# shellcheck disable=SC2086
pm2 delete $ids_to_delete
pm2 save >/dev/null
pm2 status
