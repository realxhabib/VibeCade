# {{name}}

An [VibeCade](https://github.com/realxhabib/VibeCade) app: turn-based tic-tac-toe on the shared match
state, built with Vite, React, TypeScript and [`vibecade-sdk`](https://www.npmjs.com/package/vibecade-sdk).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
```

Opened directly, the SDK starts a **mock host** with turns on: you play X against a practice bot
that this app plays itself. The browser console shows what the host sees (`[vibecade mock]`) and your
logs (`[vibecade log]`). Add `?vibecade-role=spectator` to see the read-only spectator view.

How it works:

- The board lives in the **shared match state** (`useMatchState`): one versioned JSON document per
  match that every player and spectator receives. A move is `update(add mark)` (compare-and-set,
  retried automatically if someone else wrote first) followed by `turn.end()`.
- The host tracks **whose turn** it is (`useTurn`), shows it in its HUD, and in async matches
  ("play anytime") puts "your turn" in the player's inbox. The state persists, so a game can be
  picked up days later.
- **Spectators** get every change but can't write.
- At the end every player submits `1` (win), `0.5` (draw) or `0` (loss); the platform settles the
  match with `scoring: "high"`.

| File | What |
| --- | --- |
| `src/main.tsx` | `<VibeCadeProvider>` connects to the host (or the mock, with turns on) |
| `src/App.tsx` | Board, moves, the practice bot, submitting |
| `src/game.ts` | Pure game rules (easy to unit test) |
| `vibecade.manifest.json` | Your listing and capabilities (`turnBased: true`, modes, players…) |

## Ship it

1. **Deploy** `npm run build` (the `dist/` folder) to any HTTPS static host. Allow VibeCade to frame it,
   e.g. `Content-Security-Policy: frame-ancestors https://vibecade.si https://x.com https://*.x.com https://twitter.com https://*.twitter.com` (VibeCade, and X, whose posts frame VibeCade's player card; or send no `frame-ancestors` at all).
2. **Register** the app at `https://vibecade.si/developers/new`. Copy the fields from
   `vibecade.manifest.json` and set the URL to your deployment. This creates version `1.0.0`.
3. **Sandbox**: `https://vibecade.si/developers/sandbox` plays both seats side by side with a live
   protocol log. Invite **testers** from your app's console so they can play test builds.
4. **Versions**: every change players should get is a new version on the Versions tab of
   `https://vibecade.si/developers/apps/{{slug}}`.
5. **Review**: submit the version; once approved, publish it.

Your app's console also has **Analytics** and **Logs** (everything sent with `useLogger()` /
`vibecade.log.*`, plus uncaught errors).
