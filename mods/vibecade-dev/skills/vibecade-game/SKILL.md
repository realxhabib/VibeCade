---
name: vibecade-game
description: Build, test and ship a multiplayer game or standalone app for VibeCade, the social arcade on X, with vibecade-sdk. Use when someone wants to make a VibeCade game, use vibecade-sdk or create-vibecade, write a vibecade.manifest.json, add stats, leaderboards or achievements to a VibeCade app, or get a game playable inside a post on X.
---

# Building a VibeCade game

A VibeCade game is an ordinary web page. VibeCade loads it in a sandboxed iframe and, through
`vibecade-sdk`, hands it signed-in players (X accounts), a realtime room, a shared match state,
a seeded random generator, scoring and results. People find games on vibecade.si and play them
right inside posts on X. Your job is the page; the platform does matchmaking, the versus intro,
the countdown, the results screen, XP, leaderboards, rematch and sharing.

If the `vibecade` MCP server is connected, use its tools (named in brackets below). Without it,
every step has a command or a doc link instead.

## Workflow

1. **Pick the shape of the game** (see "Choosing a multiplayer model") and a starter:
   `react` (realtime, default), `turn-based` (shared state + turns) or `vanilla` (one HTML file).
2. **Scaffold** [`vibecade_create_app`] or `npx create-vibecade my-game --template <name> --yes`,
   then `npm install` and `npm run dev`. Opened directly, the SDK starts a **mock host**: you are
   seated against a practice bot and the game plays as it would on VibeCade.
3. **Write the game** in the starter (`src/App.tsx`, or `index.html` for vanilla). Keep the starter's
   lifecycle wiring (ready, onStart, submit, bots) and replace the game itself. Look up any API
   [`vibecade_search_docs`, `vibecade_read_doc`] or in `references/api.md`; copy patterns from
   `references/patterns.md`.
4. **Fill in `vibecade.manifest.json`**: listing (name, tagline, description, category, icon,
   accent, howTo) and capabilities (kind, modes, players, teams, spectators, turnBased, setup,
   scoring). Field rules: `references/manifest.md`.
5. **Stats and achievements** (optional, recommended): declare them [`vibecade_set_progress`], then
   report them from code. Undeclared stat keys and achievement ids are refused at runtime.
6. **Check** [`vibecade_check_app` on the folder, `vibecade_validate_manifest`] and fix every error.
   Then run the project's own `npm run build` and typecheck.
7. **Play it locally** with other tables [`vibecade_test_url`]: `?xapps-players=4`, `?xapps-teams=2`,
   `?xapps-turns=1`, `?xapps-role=spectator`, `?xapps-purpose=setup`. Watch the console for
   `[xapps mock]` lines and errors. A game isn't done until a full match ends with a result.
8. **Ship** (the developer does these; walk them through it): host the build on any HTTPS static
   host with framing allowed (below), try it at https://vibecade.si/developers/sandbox, register at
   https://vibecade.si/developers/new, wait for review, **Publish** it from the console's Versions
   tab, then share `https://vibecade.si/x/<slug>` on X. Updates are new versions in the console.

## Rules that make a game work

**Lifecycle**
- Call `ready()` exactly once, after the first screen is drawn. Until then players see a loading
  screen and the match never starts. Setup screens call it too.
- Start gameplay in `onStart` (React: `useMatchStarted()`), which fires after the host's VS intro and
  countdown. Don't start the clock on load.
- Every seated player calls `submit({ score })` **exactly once** (guard it with a ref/flag). The
  platform compares scores by the manifest's `scoring` (`high`, `low`, or `votes` for crowd judging)
  and fires `onEnd` (React: `useMatchResult()`). With N players results come as `ranks`.
- Don't build your own results/rematch screen: the host shows one after `onEnd`. Show a short
  "waiting for the result…" state between your submit and `onEnd`.

**Practice and bots**
- Put `"practice"` in `modes` for every game. Signed-out people who meet your game in a post on X
  can only play practice. In practice (and the mock) the other seats are bots
  (`players.filter(p => p.isBot)`): **your client plays them** and calls `submitFor(bot.id, { score })`
  for each, or the match never ends. Spectators never drive bots.

**Everyone must see the same game**
- Anything random that players must agree on (a deck, a map, spawn points, bot moves) comes from
  `vibecade.random` (seeded by the match, identical on every client; `random.fork("label")` for
  independent streams). `Math.random()` is only for local effects like particles.
- Send moves through `room.send(type, payload)` / `room.on(type, fn)` (≤ 8 KB, ≤ 30 messages/s per
  client), or keep the game in the shared state with `state.update(fn)` (≤ 64 KB, versioned
  compare-and-set). For state sent many times a second (shooters, racers) use `room.direct()`
  (WebRTC, falls back to the room by itself). Never use the event type `xapps.direct`.
- `state.update(fn)` may run `fn` more than once: keep it pure, re-check the move against the draft
  it receives, return the next state, or `undefined` to write nothing. After a move in a turn-based
  game call `turn.end()` (or `turn.end(playerId)`).

**Roles and purposes**
- Spectators (`isSpectator`, `seat: -1`) receive everything but can't send, submit, write state or
  end turns: hide the controls. Spectators are on by default (`spectators: true`).
- `purpose` is `"match"` (play), `"setup"` (manifest `setup: true`: render a settings form and call
  `setup.submit(settings, summary)`; the settings become `match.settings`) or `"app"` (manifest
  `kind: "app"`: a standalone app with no match: no ready/onStart/submit, room or state).

**Fit the frame**
- Inside a post on a computer the game gets roughly 450 × 350 px; on phones it's full screen. Make
  the layout fit small sizes, use big touch targets, and never require hover, right-click or a
  keyboard. For anything people drag, call `vibecade.ui.lockGestures(element)` (React:
  `useGestureLock(ref)`). Respect `prefers-reduced-motion`.
- Use the host UI instead of rebuilding it: `ui.setStatus`, `ui.setScores` (HUD), `ui.setTurn`,
  `ui.toast`, `ui.celebrate`, `ui.haptic`.

**Progression**
- Stats: up to 8, `{ key, label, aggregate: max|min|sum|last, format?: number|ms|percent }`. Report
  with `stats.report({ key: value })`; read a board with `stats.leaderboard(key)`.
- Achievements: up to 30, `{ id, name, description, icon (one emoji), xp (0–100), secret? }`, ≤ 500 XP
  in total. Unlock with `achievements.unlock(id)`; the host shows the toast. Not in setup purpose or
  for spectators.

**Trust**
- Scores come from clients. Use the seed, commit–reveal for secret picks (hash the pick with a salt,
  reveal after both commit; see `examples/rps` in the VibeCade repo) or crowd judging. For games that
  must not trust clients, the app's own server referees with `vibecade-sdk/server`
  (`reportResult`, webhooks): read `sdk#server-authority--webhooks`.

**Debugging**
- Log with `vibecade.log.info(message, data)` (React: `useLogger()`); entries show in the console's
  Logs tab and uncaught errors are logged automatically. Never `console.log` secrets.

## Choosing a multiplayer model

| The game | Model | Starter |
| --- | --- | --- |
| Both play at once, compare results (reflex, quiz, score attack) | Each plays locally, broadcasts progress with `room.send`, submits its own score | `react` |
| Players alternate moves, maybe over days (board, card, word games) | Shared state (`state.update`) + `turn.end`, modes `live` + `async` + `practice`, `turnBased: true` | `turn-based` |
| Fast action where positions stream (racing, shooting, sports) | `room.direct()` at 10–20 Hz, seat 0 (`isHost`) referees shared events | `react` |
| 3–8 players free for all | `players: { min, max }`, everyone submits, read `ranks` in `onEnd` | either |
| Teams | `teams: 2–4` (seat s plays for team s % teams; max must be a multiple), team score = sum | either |
| Creative entries judged by people | `scoring: "votes"`, submit a `display` (text, image, video, audio, gallery) | `react` |
| Not a game (tool, feed, solo toy with a leaderboard) | `kind: "app"`: storage, stats, achievements, no matches | `vanilla` or `react` |

## Hosting: allow framing

In a post on X, X frames VibeCade's player card, which frames your game, and browsers check
`frame-ancestors` against each one. Send **no** `frame-ancestors` and **no** `X-Frame-Options`, or
list them all:

```
Content-Security-Policy: frame-ancestors https://vibecade.si https://x.com https://*.x.com https://twitter.com https://*.twitter.com
```

Vercel: `vercel.json` `headers`; Netlify and Cloudflare Pages: `public/_headers`; GitHub Pages needs
nothing. A game that's blank only inside X almost always has this wrong.

## When something's wrong

| Symptom | Fix |
| --- | --- |
| Stuck on the loading screen | `ready()` is never called (or throws first) |
| Practice match never ends | The app doesn't `submitFor` every bot |
| Players see different boards/maps | Use `vibecade.random`, not `Math.random()`; send moves through the room or the state |
| `forbidden` errors | A spectator, setup screen or standalone app called a match method |
| `invalid_params` on `stats.report` / `achievements.unlock` | The key/id isn't declared in the manifest (mock: pass the manifest's stats to the test URL) |
| `conflict` from `state.set` | Use `state.update(fn)`, which retries |
| `rate_limited` | Over 30 room messages/s, or more than ~4 state/turn writes/s: batch, throttle or use `room.direct()` |
| Blank inside X only | `frame-ancestors` doesn't list X (above) |

## References

- `references/api.md`: the client API and React hooks on one page
- `references/patterns.md`: copy-ready code for each multiplayer model, bots, setup screens, stats
- `references/manifest.md`: every manifest field and its limits
- Full docs: [`vibecade_read_doc`] with `sdk` (SDK reference) and `guide` (build-a-game guide), or
  https://github.com/realxhabib/VibeCade/blob/HEAD/packages/sdk/README.md and
  https://github.com/realxhabib/VibeCade/blob/HEAD/docs/build-a-game.md
