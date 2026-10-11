#!/usr/bin/env bash
# Runs on the droplet as the xapps user (the deploy workflow calls it): unpacks a built release,
# switches to it, restarts the app and checks it answers. Rolls back if it doesn't.
#   activate.sh <release-id> <tarball>
set -euo pipefail
ID="$1"
TARBALL="$2"
APP_DIR=/opt/xapps
NEW="$APP_DIR/releases/$ID"

rm -rf "$NEW" && mkdir -p "$NEW"
tar -xzf "$TARBALL" -C "$NEW"
rm -f "$TARBALL"
PREV="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
ln -sfn "$NEW" "$APP_DIR/current.next" && mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
sudo /usr/bin/systemctl restart xapps

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-3000}/x"; then
    echo "Release $ID is live."
    # Keep the newest three releases.
    ls -1dt "$APP_DIR"/releases/*/ | tail -n +4 | xargs -r rm -rf
    exit 0
  fi
  sleep 1
done

echo "Release $ID didn't answer on /x; rolling back." >&2
if [ -n "$PREV" ] && [ -d "$PREV" ]; then
  ln -sfn "$PREV" "$APP_DIR/current.next" && mv -Tf "$APP_DIR/current.next" "$APP_DIR/current"
  sudo /usr/bin/systemctl restart xapps
fi
exit 1
