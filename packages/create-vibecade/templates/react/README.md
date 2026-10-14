# {{name}}

An [VibeCade](https://github.com/realxhabib/VibeCade) app: a 10-second tap race for two players, built with
Vite, React, TypeScript and [`vibecade-sdk`](https://www.npmjs.com/package/vibecade-sdk).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

Opened directly, the SDK starts a **mock host**: you are seated against a practice bot that this app
plays itself (`submitFor`). The browser console shows what the host sees (`[xapps mock]`) and your
logs (`[xapps log]`). Handy URL switches:

- `?xapps-players=4` seats more bots (the manifest says 2, but the code handles any table).
- `?xapps-role=spectator` shows the read-only spectator view (in the mock nobody plays the bots, so
  use the Sandbox to watch a real race).

Where things are:

| File | What |
| --- | --- |
| `src/main.tsx` | `<VibeCadeProvider>` connects to the host (or the mock) |
| `src/App.tsx` | The game: `ready()`, `onStart`, `room.send`/`useRoomEvent`, `submit`, `submitFor`, `useLogger` |
| `vibecade.manifest.json` | Your listing and capabilities (players, modes, scoring…) |

## Ship it

1. **Deploy** `npm run build` (the `dist/` folder) to any HTTPS static host. Allow VibeCade to frame it,
   e.g. `Content-Security-Policy: frame-ancestors https://vibecade.si https://x.com https://*.x.com https://twitter.com https://*.twitter.com` (VibeCade, and X, whose posts frame VibeCade's player card; or send no `frame-ancestors` at all).
2. **Register** the app at `https://vibecade.si/developers/new`. Copy the fields from
   `vibecade.manifest.json` (name, tagline, description, category, icon, accent, modes, players,
   scoring, how-to…) and set the URL to your deployment. This creates version `1.0.0`.
3. **Sandbox**: open `https://vibecade.si/developers/sandbox` to play both seats side by side with
   a live protocol log. Invite **testers** from your app's console so they can play test builds.
4. **Versions**: each change you want players to get is a new version (new URL and/or manifest) on
   the Versions tab of `https://vibecade.si/developers/apps/{{slug}}`.
5. **Review**: submit the version. Once it's approved you publish it, and players get it.

Your app's console also has **Analytics** and **Logs**: everything you send with
`vibecade.log.*` / `useLogger()`, plus uncaught errors (captured automatically).

## Learn more

- SDK reference: the `vibecade-sdk` README (API, shared state, turns, media, stats, achievements, logs).
- Keep scores honest: everything that both players must agree on should come from the shared seed
  (`vibecade.random`), and secrets need commit-reveal. For full trust, settle matches from your own
  server with `vibecade-sdk/server`.
