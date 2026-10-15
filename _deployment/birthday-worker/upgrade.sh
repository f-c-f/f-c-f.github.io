#!/usr/bin/env bash
set -euo pipefail
test "$(id -u)" -eq 0 || { echo 'Run as root.' >&2; exit 1; }
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_dir=/opt/birthday-reminder
test -f "$app_dir/worker.cjs"
test ! -L "$app_dir"
test ! -L /var/lib/birthday-reminder
task_node="$app_dir/runtime/bin/node"
if [ ! -x "$task_node" ]; then task_node="$(command -v node)"; fi
"$task_node" --test "$source_dir/worker.test.cjs"
exec 9>/var/lib/birthday-reminder/run.lock
flock -w 60 9
backup="$app_dir/worker.cjs.backup-$(date +%Y%m%d-%H%M%S)"
cp -p -- "$app_dir/worker.cjs" "$backup"
install -m 0644 "$source_dir/worker.cjs" "$app_dir/worker.cjs.new"
mv -f -- "$app_dir/worker.cjs.new" "$app_dir/worker.cjs"
if [ -f /etc/birthday-reminder/secrets.env ]; then
  set -a
  source /etc/birthday-reminder/secrets.env
  set +a
fi
if ! runuser -u birthday-reminder -- env BIRTHDAY_CONFIG=/etc/birthday-reminder/config.json "$task_node" "$app_dir/worker.cjs" --dry-run; then
  cp -p -- "$backup" "$app_dir/worker.cjs"
  echo 'Dry-run failed; previous worker restored.' >&2
  exit 1
fi
echo 'Worker upgraded; dry-run passed. Existing timer, configuration and sent records preserved. No email sent during upgrade.'
