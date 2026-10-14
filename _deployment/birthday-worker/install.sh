#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root." >&2
  exit 1
fi
source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_dir=/opt/birthday-reminder
config_dir=/etc/birthday-reminder
state_dir=/var/lib/birthday-reminder
if [ -L "$app_dir" ] || [ -L "$config_dir" ] || [ -L "$state_dir" ]; then
  echo "Refusing installation through a symlink." >&2
  exit 1
fi
for file in worker.cjs worker.test.cjs dates.js lunar.js LUNAR-LICENSE.txt migrate-email-defaults.cjs migrate-email-defaults.test.cjs birthday-reminder.service birthday-reminder.timer; do
  test -f "$source_dir/$file"
done
command -v systemctl >/dev/null
command -v flock >/dev/null
command -v curl >/dev/null
command -v sha256sum >/dev/null

if ! id birthday-reminder >/dev/null 2>&1; then
  useradd --system --home-dir "$state_dir" --shell /usr/sbin/nologin birthday-reminder
fi
install -d -m 0755 "$app_dir"
install -d -o root -g birthday-reminder -m 0750 "$config_dir"
install -d -o birthday-reminder -g birthday-reminder -m 0700 "$state_dir"

# Use an isolated supported Node runtime; don't replace another service's Node.
task_node="$(command -v node || true)"
if [ -z "$task_node" ] || ! "$task_node" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  case "$(uname -m)" in
    x86_64) node_arch=x64 ;;
    aarch64) node_arch=arm64 ;;
    *) echo "Unsupported CPU architecture." >&2; exit 1 ;;
  esac
  install -d -m 0755 "$app_dir/runtime"
  runtime_temp="$(mktemp -d)"
  node_archive=''
  trap 'rm -f -- "$runtime_temp/SHASUMS256.txt"; if [ -n "$node_archive" ]; then rm -f -- "$runtime_temp/$node_archive"; fi; rmdir -- "$runtime_temp"' EXIT
  curl --fail --silent --show-error --max-time 60 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$runtime_temp/SHASUMS256.txt"
  node_archive="$(awk -v arch="$node_arch" '$2 ~ "^node-v[0-9.]+-linux-" arch "\\.tar\\.xz$" {print $2}' "$runtime_temp/SHASUMS256.txt")"
  test -n "$node_archive"
  test "$(printf '%s\n' "$node_archive" | wc -l)" -eq 1
  curl --fail --silent --show-error --max-time 120 "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$runtime_temp/$node_archive"
  (cd "$runtime_temp" && grep "  $node_archive\$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$runtime_temp/$node_archive" --strip-components=1 -C "$app_dir/runtime"
  task_node="$app_dir/runtime/bin/node"
fi

for file in worker.cjs worker.test.cjs dates.js lunar.js LUNAR-LICENSE.txt migrate-email-defaults.cjs migrate-email-defaults.test.cjs; do
  install -m 0644 "$source_dir/$file" "$app_dir/$file"
done
if [ ! -f "$config_dir/config.json" ]; then
  if [ -z "${BIRTHDAY_RECIPIENT:-}" ]; then
    echo "Set BIRTHDAY_RECIPIENT to the receiving email address." >&2
    exit 1
  fi
  "$task_node" -e 'const fs=require("fs");fs.writeFileSync(process.argv[1],JSON.stringify({databaseUrl:"https://moneybase-bf6ec-default-rtdb.asia-southeast1.firebasedatabase.app",recipient:process.env.BIRTHDAY_RECIPIENT,mode:"dry-run",stateDir:"/var/lib/birthday-reminder"},null,2),{mode:0o640});' "$config_dir/config.json"
fi
chown root:birthday-reminder "$config_dir/config.json"
chmod 0640 "$config_dir/config.json"
if [ ! -f "$config_dir/secrets.env" ]; then
  install -m 0600 /dev/null "$config_dir/secrets.env"
fi

sed "s|/usr/bin/node|$task_node|g" "$source_dir/birthday-reminder.service" > /etc/systemd/system/birthday-reminder.service
install -m 0644 "$source_dir/birthday-reminder.timer" /etc/systemd/system/birthday-reminder.timer
chmod 0644 /etc/systemd/system/birthday-reminder.service
"$task_node" --test "$app_dir/worker.test.cjs"
systemd-analyze verify /etc/systemd/system/birthday-reminder.service /etc/systemd/system/birthday-reminder.timer
systemctl daemon-reload
systemctl start birthday-reminder.service
systemctl enable --now birthday-reminder.timer
systemctl list-timers birthday-reminder.timer --no-pager
cat "$state_dir/last-run.json"
echo
echo "Installed. New configurations use dry-run mode and do not send mail."
