#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "${1:-/home/dilly/Server/server-manager}"
git status --short --branch
if ! git diff --cached --quiet; then
  echo 'Staged changes found; resolve them before cleanup.' >&2
  exit 1
fi
# Only accept the observed npm churn: libc fields removed, nothing else.
node <<'NODE'
const fs = require('fs');
const cp = require('child_process');
const assert = require('assert');
for (const file of ['package-lock.json', 'frontend/package-lock.json']) {
  const before = JSON.parse(cp.execFileSync('git', ['show', `HEAD:${file}`], {encoding: 'utf8'}));
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [name, pkg] of Object.entries(before.packages || {})) {
    const current = (after.packages || {})[name];
    if (current && !Object.prototype.hasOwnProperty.call(current, 'libc')) delete pkg.libc;
  }
  assert.deepStrictEqual(after, before, `${file}: unexpected changes; refusing cleanup`);
}
NODE
backup=$(mktemp -d "${HOME}/server-manager-build-cleanup.XXXXXXXX")
mkdir -p "$backup/frontend"
files=(package-lock.json frontend/package-lock.json frontend/tsconfig.tsbuildinfo frontend/tsconfig.node.tsbuildinfo)
for file in "${files[@]}"; do
  if [[ -f "$file" ]]; then cp -p -- "$file" "$backup/$file"; fi
done
git diff --binary -- "${files[@]}" > "$backup/changes.patch"
printf 'Backup saved to %s\n' "$backup"
for file in "${files[@]}"; do
  if git ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
    git restore --worktree -- "$file"
  fi
done
git status --short --branch
echo 'Cleanup complete. Review status, then run git pull --ff-only when ready.'
