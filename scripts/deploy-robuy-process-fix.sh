#!/usr/bin/env bash
# Run interactively as dilly. Restarting Server Manager interrupts all its projects.
set -euo pipefail
umask 077
manager=/home/dilly/Server/server-manager
bot=/home/dilly/Server/robuy
for repo in "$manager" "$bot"; do
  git -C "$repo" status --short --branch
  if [[ -n "$(git -C "$repo" status --porcelain)" ]]; then
    echo "Checkout has local changes: $repo. Preserve/reconcile them before deployment." >&2
    exit 1
  fi
  [[ "$(git -C "$repo" branch --show-current)" == main ]] || { echo "Expected main: $repo" >&2; exit 1; }
  git -C "$repo" fetch origin main
  git -C "$repo" merge-base --is-ancestor HEAD origin/main || { echo "Cannot fast-forward $repo" >&2; exit 1; }
done
[[ "$(systemctl show server-manager.service -p KillMode --value)" == control-group ]] || {
  echo 'Expected systemd KillMode=control-group to clean existing orphan processes.' >&2; exit 1;
}
sudo -v
backup=$(mktemp -d "$HOME/server-manager-process-fix.XXXXXXXX")
for name in server-manager robuy; do
  repo="/home/dilly/Server/$name"
  mkdir "$backup/$name"
  git -C "$repo" rev-parse HEAD > "$backup/$name/revision.txt"
  for file in config.json .env; do
    if [[ -f "$repo/$file" ]]; then
      cp -- "$repo/$file" "$backup/$name/$file"
      chmod 600 "$backup/$name/$file"
    fi
  done
done
echo "Deployment backup: $backup"
echo 'Stopping Server Manager and ALL projects in its service cgroup.'
sudo systemctl stop server-manager.service
trap 'echo "Deployment interrupted. Inspect the error before restarting: sudo systemctl start server-manager.service" >&2' ERR
# The old npm process group also held the orphan bot. Verify it is gone before
# allowing autostart to launch a replacement; never use a broad pkill node.
python3 - "$bot" <<'PY'
import os, sys
target = os.path.realpath(sys.argv[1])
live = []
for pid in os.listdir('/proc'):
    if not pid.isdigit(): continue
    try:
        with open('/proc/' + pid + '/cmdline', 'rb') as f:
            argv = f.read().split(b'\0')
        executable = os.path.basename(os.fsdecode(argv[0]))
        if executable in ('node', 'nodejs', 'npm') and os.path.realpath(os.readlink('/proc/' + pid + '/cwd')) == target:
            live.append(pid)
    except (FileNotFoundError, PermissionError, ProcessLookupError):
        pass
if live:
    sys.exit('Processes still in Robuy directory: ' + ', '.join(live) + '. Manager remains stopped; inspect before restarting.')
PY
for repo in "$manager" "$bot"; do
  # Use the already fetched revisions, avoiding network failure during downtime.
  git -C "$repo" merge --ff-only origin/main
done
# No dependency versions or frontend sources changed in this fix. Do not run
# setup, install packages, overwrite config, or migrate live application data.
sudo systemctl start server-manager.service
trap - ERR
systemctl status server-manager.service --no-pager
echo 'Check Robuy in the dashboard. Start it once if it is not configured for boot autostart.'
echo 'On failure after stop, inspect the error and restart with: sudo systemctl start server-manager.service'
