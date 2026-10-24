# vibecade-sdk on one page

```bash
npm i vibecade-sdk        # ESM + TypeScript types; React hooks need react ≥ 18
```

No build step: `import { connect } from "https://vibecade.si/sdk/v1.js"` in a `<script type="module">`,
or `<script src="https://vibecade.si/sdk/v1.global.js">` for `window.VibeCade`.

Entry points: `vibecade-sdk` (apps), `vibecade-sdk/react` (hooks), `vibecade-sdk/server` (your
server only: webhooks + server API, never in the browser), `vibecade-sdk/host` (embedding / tests),
`vibecade-sdk/protocol` (wire types).

## Connecting

```ts
import { connect } from "vibecade-sdk";
const vibecade = await connect();      // shared client; opened directly it starts the mock host
```

`connect({ mock: { players: 4, teams: 2, turnBased: true, role: "spectator", purpose: "setup", settings, state, stats, achievements, startDelayMs } })`
configures the mock (only used outside VibeCade). URL switches do the same: `?xapps-players=4`,
`?xapps-teams=2`, `?xapps-turns=1`, `?xapps-role=spectator`, `?xapps-purpose=setup|app`,
`?xapps-settings=<json>`, `?xapps-stats=<json>`, `?xapps-achievements=<json>`.

Other options: `hostOrigins` (pin trusted hosts), `captureErrors: false`, `gestures: false`, `timeoutMs`.

## Client

| Member | |
| --- | --- |
| `purpose` | `"match"`, `"setup"` or `"app"` (`isStandalone` = app) |
| `me`, `players`, `opponents`, `opponent`, `teammates`, `player(id)`, `isBot(id)` | `PlayerInfo { id, handle, name, avatarUrl, seat, isBot, submitted, score, team, role }`; `players` is seated players by seat |
| `role`, `isSpectator`, `isHost` | `isHost`: seat 0, for when one client referees |
| `match` | `{ id, mode: live·async·practice·sandbox, status, scoring, seed, settings, minPlayers, maxPlayers, teams, state, stateVersion, turn, turnDeadline, round }` |
| `random` | Match-seeded, same on every client: `next() int(min,max) float(min,max) pick(list) shuffle(list) normal() chance(p) fork(label)` |
| `ready()` | Call once, when the first screen is up |
| `onStart(fn)` · `onEnd(fn)` · `onUpdate(fn)` · `onTurn(fn)` · `onRound(fn)` · `onReaction(fn)` · `onAchievement(fn)` | Return an unsubscribe function |
| `submit({ score?, data?, display? })` | Once per seated player. → `{ state: "waiting" \| "final", result }` |
| `submitFor(botId, { score?, … })` | For each bot in practice |
| `forfeit()` | Give up the match |
| `finalResult`, `hasStarted` | Last known result / whether onStart fired |

`MatchResult { matchId, status, winnerId (null: draw or team play), winnerTeam?, ranks?: { [id]: 1|2|… }, scores, votes?, xp? }`

`display` (shown on results and entries): `{ kind: "text", title?, body }`, `{ kind: "svg", svg, alt }`,
`{ kind: "image", url, alt }`, `{ kind: "video", url, alt, poster? }`, `{ kind: "audio", url, alt, cover? }`,
`{ kind: "gallery", items: [{ url, alt }] }` (2–6). Media URLs must come from `media.upload`.

### Room (realtime)

| | |
| --- | --- |
| `room.send(type, payload)` | To every other client in the match (spectators too). JSON ≤ 8 KB, ≤ 30/s per client |
| `room.on(type, (payload, from, message) => …)` · `room.onAny(fn)` | Messages from others (not your own) |
| `room.onPresence(online => …)` · `room.online()` | Connected player ids |
| `room.direct({ relayHz?, iceServers?, spectators? })` | WebRTC mesh: `send(data, { reliable?, to? })`, `onMessage((data, from, via) => …)`, `onStatus`, `rtt(id)`, `close()` |

### Shared state, turns, rounds

| | |
| --- | --- |
| `state.current` · `state.version` | Latest known |
| `state.update(draft => next \| undefined, { retries? })` | Read-modify-write with retry on conflict. `fn` gets a copy; keep it pure. → `{ state, version }` |
| `state.set(value, expectedVersion?)` | Raw compare-and-set (`conflict` error) |
| `state.onChange((state, { version, by }) => …)` | Every change, yours included |
| `turn.current` · `turn.isMine` · `turn.deadline` · `turn.end(next?)` | Next seat by default, or a player id |
| `round.current` · `round.set(n)` | Round counter in the HUD (never goes back) |

State ≤ 64 KB JSON. About 4 state/turn writes per second per client (burst 10).

### Setup screen (`purpose === "setup"`)

`setup.submit(settings, summary?)` (settings ≤ 4 KB object, summary ≤ 140 chars, shown on the
invite) · `setup.cancel()` · prefill from `match.settings` · `ui.autoResize()` sizes the sheet.

### Host UI

`ui.setStatus(text)` · `ui.setScores({ [id]: n })` · `ui.setTurn(id)` · `ui.toast(msg, "info" | "success" | "warning" | "danger")` ·
`ui.celebrate("small" | "big")` · `ui.haptic("light" | "medium" | "heavy" | "success" | "error")` · `ui.resize(px)` · `ui.autoResize()` ·
`ui.lockGestures(el)` · `social.share(text, url?)` (opens the X composer; the player confirms).

### Data

| | |
| --- | --- |
| `storage.get(key, { scope? })` · `set(key, value)` · `delete(key)` · `list({ prefix?, scope? })` | `user` scope (private, default) or `app` (read-only here, written by your server). ≤ 64 KB per value, ≤ 200 keys |
| `media.upload(blob, { alt? })` · `media.kindOf(mime)` | → `{ url, kind, mime, bytes, width?, height?, duration? }`. Image 8 MB, audio 10 MB, video 25 MB |
| `stats.defs` · `stats.report({ key: n })` · `stats.leaderboard(key, { limit? })` | Report → new aggregates. Leaderboard → `{ key, top: [{ rank, player, value }], me: { rank, value } \| null, total }` |
| `achievements.defs` · `achievements.unlock(id)` · `achievements.unlocked` | Unlock → `{ unlocked }` (false if already had) |
| `log.debug/info/warn/error(message, data?)` | Fire and forget, shown in the console's Logs tab |

Errors are `VibeCadeError` with `code`: `invalid_params`, `forbidden`, `rate_limited`, `conflict`,
`timeout`, `not_connected`, `unknown_method`, `internal`.

## React (`vibecade-sdk/react`)

```tsx
<VibeCadeProvider fallback={<Loading />} errorFallback={(e) => <p>{e.message}</p>} options={{ mock: { startDelayMs: 800 } }}>
  <App />
</VibeCadeProvider>
```

| Hook | Returns |
| --- | --- |
| `useVibeCade()` | The client |
| `useUser()` · `useStandalone()` | Signed-in user · `purpose === "app"` |
| `usePlayers()` | `{ players, opponents, teammates, me, role, isSpectator }` |
| `useMatch()` · `useMatchStarted()` · `useMatchResult()` | Match · `true` after onStart · `MatchResult \| null` |
| `useRoomEvent(type, (payload, from) => …)` · `usePresence()` | Subscribe for the component's lifetime · online ids |
| `useMatchState<T>()` | `{ state, version, update, set }` |
| `useTurn()` · `useRound()` · `useSetup()` | `{ turn, isMine, deadline, end }` · `{ round, set }` · `{ purpose, isSetup, settings, submit, cancel }` |
| `useStats()` · `useStatStanding(key, { limit })` · `useAchievements()` · `useAchievementEvents(fn)` | `{ defs, report }` · `{ standing, loading, error, refresh }` · `{ defs, unlock, unlocked }` |
| `useMediaUpload()` · `useLogger()` · `useAutoResize()` · `useGestureLock(ref)` · `useReactions(fn)` | |

Call `vibecade.ready()` yourself in an effect; the provider doesn't. Lint-friendly React: subscribe
in effects, keep `submitted` guards in refs.
