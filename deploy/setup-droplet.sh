#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu droplet that will run Vibecade.
#
#   scp deploy/setup-droplet.sh root@<droplet-ip>:   &&   ssh root@<droplet-ip> bash setup-droplet.sh
#
# Installs Docker, opens only SSH/HTTP/HTTPS, adds swap on small droplets and creates
# a `deploy` user (in the docker group) that GitHub Actions logs in as. Safe to re-run.
set -euo pipefail

APP_DIR=/opt/vibecade/deploy
DEPLOY_USER=deploy

if [[ $EUID -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl ufw

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# Small droplets: swap keeps a traffic spike (or an on-droplet build) from getting OOM-killed.
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
if [[ ! -f "$APP_DIR/.env" ]]; then
  cat > "$APP_DIR/.env" <<'ENV'
SITE_DOMAIN=vibecade.si
# Server-only secrets for the app (optional):
XAI_API_KEY=
ENV
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

cat <<DONE

Droplet ready.
Next:
  1. Point DNS at this droplet: A records for vibecade.si and www.vibecade.si -> $(curl -fsS https://ipv4.icanhazip.com 2>/dev/null || echo '<droplet-ip>')
  2. Add the GitHub Actions public key to /home/$DEPLOY_USER/.ssh/authorized_keys
  3. Edit $APP_DIR/.env if you use XAI_API_KEY
  4. Run the "Deploy" workflow in GitHub (or push to main).
DONE
