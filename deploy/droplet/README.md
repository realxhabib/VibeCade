# XApps on a DigitalOcean droplet

GitHub Actions builds the app (a Next.js `standalone` server; the droplet is too small to build it) and
ships it to the droplet over SSH, where systemd runs it behind Caddy (HTTPS). It runs next to anything
Caddy already serves there (e.g. the ClaudeArcade server); setup only adds its own site.

Address used below: `vibecade.si` (with `www.vibecade.si` redirecting to it). Without a domain,
`xapps.174-138-34-59.sslip.io` works too: sslip.io names resolve to the IP in them, so there's no DNS.

## 0. DNS (at your domain registrar)

Point both names at the droplet, and remove any other A/AAAA records for them (e.g. a parking page):

| Type | Name | Value |
| --- | --- | --- |
| A | `@` (vibecade.si) | `174.138.34.59` |
| A | `www` | `174.138.34.59` |

Wait until `vibecade.si` resolves to `174.138.34.59` (e.g. https://dnschecker.org) before step 2, so Caddy
can get its HTTPS certificate.

## 1. A deploy key (on your computer)

```bash
ssh-keygen -t ed25519 -f xapps_deploy -N "" -C github-actions
```

This makes `xapps_deploy` (private: goes into GitHub) and `xapps_deploy.pub` (public: goes on the droplet).

## 2. Set up the droplet (once, in DigitalOcean's droplet console, as root)

```bash
apt-get install -y curl
curl -fsSL https://raw.githubusercontent.com/realxhabib/XApps/claude/wizardly-clarke-uidodp/deploy/droplet/setup.sh -o setup.sh
bash setup.sh vibecade.si,www.vibecade.si "PASTE THE CONTENTS OF xapps_deploy.pub HERE"
```

It installs Node 22 if needed, adds 1 GB of swap, an `xapps` user that GitHub deploys as (it may only
restart the app), `/etc/xapps.env` for server-only secrets, the `xapps` systemd service on
127.0.0.1:3000, and a Caddy site for the first domain, with the others redirecting to it (the existing
Caddyfile is backed up first).

## 3. GitHub secrets (repo → Settings → Secrets and variables → Actions)

| Secret | Value |
| --- | --- |
| `DROPLET_HOST` | `174.138.34.59` |
| `DROPLET_SSH_KEY` | the whole `xapps_deploy` file |
| `SITE_URL` | `https://vibecade.si` |
| `NEXT_PUBLIC_SUPABASE_URL` | same as on Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | same as on Vercel |
| `NEXT_PUBLIC_SUPABASE_X_PROVIDER` | only if set on Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | optional: lets builds of the default branch sync the app catalog |

## 4. Supabase

Authentication → URL Configuration → Redirect URLs: add
`https://vibecade.si/auth/callback` and `https://vibecade.si/x/auth/callback`.

In the X developer portal, set the app's website URL to `https://vibecade.si`.

## 5. Deploy

Every push to the default branch (and, for now, to `claude/wizardly-clarke-uidodp`) deploys. Without the
secrets the workflow skips with a warning. To deploy right after adding them: Actions → Deploy to droplet →
re-run the latest run. A release that doesn't answer is rolled back automatically.

Check it: `https://vibecade.si/x/preview`. Post `https://vibecade.si/x` on X.

## On the droplet

- Logs: `journalctl -u xapps -f` · status: `systemctl status xapps` · Caddy: `journalctl -u caddy`
- Server-only secrets (e.g. `XAI_API_KEY`): edit `/etc/xapps.env`, then `systemctl restart xapps`
- Releases live in `/opt/xapps/releases` (the newest three), `/opt/xapps/current` points at the live one

The $4 droplet (512 MB) runs it with the swap; the $6 one (1 GB) leaves more headroom alongside the arcade.
