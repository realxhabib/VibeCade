# Deploying Vibecade to a DigitalOcean droplet

The whole arcade (marketplace, play rooms, every first-party game under `/embed/*`, the
example apps and the SDK bundle under `/sdk/*`) is one Next.js server. On the droplet it
runs as a Docker container behind [Caddy](https://caddyserver.com), which serves
`https://vibecade.si`, fetches and renews its TLS certificate, and redirects `www`.
Supabase (database, auth, realtime) stays where it is; only the web tier moves.

```
browser ──https──▶ Caddy :443 ──▶ web :3000 (Next.js standalone)
   └──────────── wss/https ────────────▶ Supabase (auth, RPCs, realtime)
```

GitHub Actions builds the image (a 1–2 GB droplet can't comfortably build Next.js with
three.js), pushes it to GitHub Container Registry and rolls it out over SSH.

## One-time setup

1. **Create the droplet**: Ubuntu 24.04, 1 GB RAM or more (2 GB recommended), in a region
   near your players. Add your SSH key.

2. **Point DNS at it.** At your registrar for `vibecade.si`, create:

   | Type | Name | Value |
   | --- | --- | --- |
   | A | `@` | droplet IPv4 |
   | A | `www` | droplet IPv4 |
   | AAAA | `@`, `www` | droplet IPv6 (only if you enabled IPv6) |

   Caddy can only get the certificate once these resolve to the droplet.

3. **Provision the droplet** (Docker, firewall for 22/80/443, swap, a `deploy` user):

   ```bash
   scp deploy/setup-droplet.sh root@<droplet-ip>:
   ssh root@<droplet-ip> bash setup-droplet.sh
   ```

4. **Give GitHub Actions SSH access** with a dedicated key:

   ```bash
   ssh-keygen -t ed25519 -f vibecade_deploy -N "" -C "github-actions"
   ssh root@<droplet-ip> "cat >> /home/deploy/.ssh/authorized_keys" < vibecade_deploy.pub
   ```

5. **Configure the repository** (*Settings → Secrets and variables → Actions*):

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `DROPLET_HOST` | droplet IP (or `vibecade.si` once DNS works) |
   | Secret | `DROPLET_SSH_KEY` | contents of `vibecade_deploy` (the private key) |
   | Secret | `SUPABASE_SERVICE_ROLE_KEY` | optional: syncs the official games after each deploy |
   | Variable | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | Variable | `NEXT_PUBLIC_SUPABASE_X_PROVIDER` | optional (`x` or `twitter`) |
   | Variable | `SITE_DOMAIN` | optional, defaults to `vibecade.si` |

   Without the Supabase variables the site runs in demo mode.

6. **Update Supabase** (*Authentication → URL Configuration*): set the Site URL to
   `https://vibecade.si` and add `https://vibecade.si/auth/callback` to the redirect
   URLs. The X developer portal callback stays `https://<project-ref>.supabase.co/auth/v1/callback`.

7. **Deploy**: run the **Deploy** workflow from the Actions tab (or push to `main`). It
   builds, pushes `ghcr.io/<owner>/<repo>`, copies `docker-compose.yml` and `Caddyfile`
   to `/opt/vibecade/deploy`, starts the stack and waits for the health check.

Server-only secrets the app reads at runtime (for example `XAI_API_KEY` for trending
memes) go in `/opt/vibecade/deploy/.env` on the droplet; restart with
`docker compose up -d` after editing it.

## Day to day

```bash
ssh deploy@vibecade.si
cd /opt/vibecade/deploy
docker compose ps                 # status and health
docker compose logs -f web        # app logs
docker compose logs -f caddy      # TLS / proxy logs
docker compose restart web
```

**Roll back** to an earlier build: set `VIBECADE_IMAGE=ghcr.io/<owner>/<repo>:<older-sha>`
in `.env` and run `docker compose up -d` (log in to ghcr.io first if the package is private).

## Without GitHub Actions

On a droplet with 2 GB+ RAM you can build there instead:

```bash
git clone <repo> /opt/vibecade && cd /opt/vibecade/deploy
cp .env.example .env              # fill in the NEXT_PUBLIC_* values
docker compose up -d --build
```

Then run `npm run sync-apps` from any checkout with `SUPABASE_SERVICE_ROLE_KEY` set to
publish the official games to the database.
