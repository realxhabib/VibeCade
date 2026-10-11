#!/usr/bin/env bash
# One-time setup of a DigitalOcean droplet (Ubuntu) to run XApps next to whatever Caddy already serves.
#
#   sudo bash setup.sh <domain> "<deploy public key>"
#   e.g. sudo bash setup.sh xapps.174-138-34-59.sslip.io "ssh-ed25519 AAAA... github-actions"
#
# Then GitHub Actions (.github/workflows/deploy-droplet.yml) builds the app and ships it here over SSH
# as the `xapps` user. Safe to re-run: it only adds what's missing.
set -euo pipefail

DOMAIN="${1:-}"
PUBKEY="${2:-}"
APP_USER=xapps
APP_DIR=/opt/xapps
PORT=3000
ENV_FILE=/etc/xapps.env
CADDYFILE=/etc/caddy/Caddyfile

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo bash setup.sh ...)."; exit 1; }
[ -n "$DOMAIN" ] || { echo "Usage: sudo bash setup.sh <domain> \"<deploy public key>\""; exit 1; }

say "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates tar >/dev/null

say "Node.js (20.9 or newer)"
need_node=1
if command -v node >/dev/null; then
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)' && need_node=0
fi
if [ "$need_node" = 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node --version

say "Swap (small droplets run out of memory without it)"
if ! swapon --show | grep -q .; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

say "User $APP_USER and $APP_DIR"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
# No password, but not "locked" either: some sshd setups refuse key logins for locked accounts.
usermod -p "*" "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR" "$APP_DIR/releases" "$APP_DIR/incoming"
if [ -n "$PUBKEY" ]; then
  install -d -m 700 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/.ssh"
  touch "$APP_DIR/.ssh/authorized_keys"
  grep -qxF "$PUBKEY" "$APP_DIR/.ssh/authorized_keys" || echo "$PUBKEY" >> "$APP_DIR/.ssh/authorized_keys"
  chown "$APP_USER:$APP_USER" "$APP_DIR/.ssh/authorized_keys" && chmod 600 "$APP_DIR/.ssh/authorized_keys"
fi
# The deploy may restart the app, and nothing else as root.
cat > /etc/sudoers.d/xapps <<SUDO
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart xapps, /usr/bin/systemctl is-active xapps
SUDO
chmod 440 /etc/sudoers.d/xapps
visudo -cf /etc/sudoers.d/xapps >/dev/null

say "Runtime settings ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<ENV
# XApps runtime settings. NEXT_PUBLIC_* values are baked in at build time (GitHub secrets), not read here.
NODE_ENV=production
PORT=$PORT
HOSTNAME=127.0.0.1
NODE_OPTIONS=--max-old-space-size=384
# Server-only secrets (optional):
# SUPABASE_SERVICE_ROLE_KEY=
# XAI_API_KEY=
ENV
fi
chown root:"$APP_USER" "$ENV_FILE" && chmod 640 "$ENV_FILE"

say "systemd service (xapps)"
cat > /etc/systemd/system/xapps.service <<UNIT
[Unit]
Description=XApps (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/current/apps/web
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/env node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable xapps >/dev/null 2>&1 || true
[ -e "$APP_DIR/current" ] && systemctl restart xapps || echo "(It starts after the first deploy.)"

say "Caddy site for $DOMAIN"
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
touch "$CADDYFILE"
if ! grep -q "^$DOMAIN " "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%s)"
  cat >> "$CADDYFILE" <<SITE

# XApps (added by deploy/droplet/setup.sh)
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
}
SITE
fi
caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null
systemctl reload caddy || systemctl restart caddy

say "Firewall"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  ufw status | sed -n '1,12p'
else
  echo "ufw is off; nothing to change."
fi

say "Done"
echo "Add these GitHub secrets (Settings -> Secrets and variables -> Actions):"
echo "  DROPLET_HOST     = $(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo "  DROPLET_SSH_KEY  = the private half of the deploy key"
echo "  SITE_URL         = https://$DOMAIN"
echo "Then run the 'Deploy to droplet' workflow. App: https://$DOMAIN"
