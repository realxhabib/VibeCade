# VibeCade (formerly XApps) — notes for coding agents

Monorepo (npm workspaces): `apps/web` (Next.js 16 App Router, React 19, Tailwind v4, `motion/react`),
`packages/sdk` (`vibecade-sdk`), `supabase/` (migrations + SQL tests), `examples/rps`.

- Next.js 16 differs from older versions: read `apps/web/AGENTS.md` and the bundled docs in
  `node_modules/next/dist/docs/` (e.g. `proxy.ts` replaced middleware; `params` are Promises).
- The web app imports the SDK **from source** via tsconfig paths; `npm run sync-sdk` (run by dev/build)
  builds the browser bundle into `apps/web/public/sdk/` and copies `examples/` into `public/`.
- Two interchangeable backends behind `src/platform/backend.ts`: `DemoBackend` (no env vars; localStorage +
  BroadcastChannel + bot personas) and `SupabaseBackend` (RPCs in `supabase/migrations`). Keep both in sync
  with `src/platform/types.ts` and the SQL `match_json` shape.
- First-party apps live in `src/first-party/<slug>` + `src/app/embed/<slug>/page.tsx` and must only use the
  public SDK (see `src/first-party/README.md` for the host contract). Their `public.apps` rows come from
  `src/platform/catalog.ts` via `npm run sync-apps` (run by production builds): no migration per app.
- Motion: springs from `src/lib/motion.ts`; respect `useReducedMotion()`; sounds via `src/lib/sfx.ts`.
- Platform v2 (docs/platform-v2.md): matches seat 2–8 players with teams/spectators, a shared versioned
  match state (`state.update`), turns and rounds, and apps may render their own challenge setup (purpose
  "setup"). SQL, demo backend and `src/platform/scoring.ts` settlement must stay in lockstep.
- Playable posts (`/x`, `/x/<slug>` share links → `/x/play…` player cards, `src/lib/x-player.ts`): guests play
  practice on a local engine (`platform/guest.ts`); signing in goes through a popup and the `x_auth_handoff` RPCs
  onto the card's own session (`platform/x-session.ts`); the match host takes its links from `play/host-routes.tsx`.
- Live server: fast first-party games (`liveServer: true` in the catalog) open their match room on the
  Claude Arcade server (`NEXT_PUBLIC_LIVE_SERVER_URL`, `platform/supabase/live-room.ts`; the server side is
  `server/rooms.mjs` in realxhabib/ClaudeArcade) instead of Supabase Realtime. Match state and results stay in Supabase.
- Lint uses the React Compiler rules: no setState in effect bodies, no ref access during render.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e` (demo mode),
`supabase/tests/run.sh` (needs a local Postgres).
