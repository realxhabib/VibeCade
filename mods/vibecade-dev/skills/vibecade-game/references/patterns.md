# VibeCade game patterns

Copy-ready shapes for each kind of game. Names follow the starters: the client is `vibecade`.
The starters from `create-vibecade` are complete, linted versions of the first two patterns: start
from them and change the game, not the wiring.

## Realtime duel or race (everyone plays at once)

Each client runs the game locally from `onStart`, broadcasts progress, and submits its own score.
The `react` starter (a tap race) is this pattern.

```ts
import { connect } from "vibecade-sdk";

const vibecade = await connect();
const bots = vibecade.isSpectator ? [] : vibecade.opponents.filter((p) => p.isBot);
let submitted = false;

vibecade.room.on<{ score: number }>("progress", ({ score }, from) => drawOpponent(from, score));
vibecade.onStart(() => startRound());            // after the host's VS intro + countdown
vibecade.onEnd((result) => showWaitingDone(result.winnerId === vibecade.me.id));
drawFirstScreen();
await vibecade.ready();

function onScore(score: number) {
  void vibecade.room.send("progress", { score }).catch(() => {}); // ≤ 30/s: throttle per frame
  void vibecade.ui.setScores({ [vibecade.me.id]: score });
}

async function finish(score: number) {
  if (submitted || vibecade.isSpectator) return;
  submitted = true;
  await vibecade.submit({ score, display: { kind: "text", title: "Score", body: `${score} points` } });
  for (const bot of bots) await vibecade.submitFor(bot.id, { score: botScore(bot.id) });
}

// Practice bots play from the shared seed so every screen agrees.
function botScore(id: string) {
  const rng = vibecade.random.fork(`bot:${id}`);
  return rng.int(8, 20);
}
```

Fair timing: every client times its own round from its own `onStart`, so the network delay
doesn't matter. Don't trust a clock sent by another player.

## Turn-based on the shared state

The board lives in the match state; a move is `state.update` then `turn.end`. Live games, games
played over days, reloads and spectators all work the same way. The `turn-based` starter
(tic-tac-toe) is this pattern. Manifest: `turnBased: true`, modes `live`, `async`, `practice`.

```tsx
import { useMatchResult, useMatchStarted, useMatchState, usePlayers, useTurn, useVibeCade } from "vibecade-sdk/react";

type Board = { cells: (string | null)[]; winner: string | null };
const empty = (): Board => ({ cells: Array(9).fill(null), winner: null });

function Game() {
  const vibecade = useVibeCade();
  const started = useMatchStarted();
  const { state, update } = useMatchState<Board>();
  const turn = useTurn();
  const { players, me, isSpectator } = usePlayers();
  const board = state ?? empty();
  const submitted = useRef(false);

  useEffect(() => { vibecade.ready().catch(() => {}); }, [vibecade]);

  async function play(cell: number, by = me.id) {
    let moved = false;
    const snap = await update((draft) => {
      const next = draft ?? empty();                  // a fresh copy: safe to mutate
      if (next.winner || next.cells[cell]) return undefined; // re-checked on every retry
      next.cells[cell] = by;
      next.winner = findWinner(next.cells);
      moved = true;
      return next;
    });
    if (moved && !snap.state?.winner) await turn.end();   // next seat, or turn.end(playerId)
  }

  // Practice: when it's a bot's turn, this client moves for it.
  const bot = players.find((p) => p.isBot && p.id === turn.turn);
  useEffect(() => {
    if (!started || !bot || board.winner || isSpectator) return;
    const t = setTimeout(() => play(pickCell(board, vibecade.random.fork(`bot:${board.cells.join()}`)), bot.id), 600);
    return () => clearTimeout(t);
  }, [started, bot, board, isSpectator]);

  // Game over: everyone submits once (1 win, 0.5 draw, 0 loss), and for bots.
  useEffect(() => {
    if (!board.winner || isSpectator || submitted.current) return;
    submitted.current = true;
    const score = (id: string) => (board.winner === "draw" ? 0.5 : board.winner === id ? 1 : 0);
    void vibecade.submit({ score: score(me.id) });
    for (const p of players) if (p.isBot) void vibecade.submitFor(p.id, { score: score(p.id) });
  }, [board.winner]);

  const canMove = started && turn.isMine && !isSpectator && !board.winner;
  // render cells; disable them unless canMove
}
```

In async matches `turn.deadline` is when the turn times out (3 days); missing it forfeits.

## 3–8 players, free for all

```ts
const vibecade = await connect();               // manifest players: { min: 2, max: 6 }
vibecade.ui.setScores(Object.fromEntries(vibecade.players.map((p) => [p.id, 0])));
if (vibecade.isHost) await vibecade.round.set(1);  // seat 0 drives shared counters
// …every seated player submits once; bots via submitFor
vibecade.onEnd(({ ranks, winnerId }) => showPlacement(ranks?.[vibecade.me.id])); // ties share a rank
```

Test with `?vibecade-players=6`. Lay the table out for any count from `min` to `max`.

## Teams

Manifest `teams: 2` (2–4; `players.max` must be a multiple). Seat `s` plays for team `s % teams`.

```ts
const mine = vibecade.me.team;
const allies = vibecade.teammates;
const rivals = vibecade.opponents.filter((p) => p.team !== mine);
vibecade.onEnd(({ winnerTeam }) => banner(winnerTeam === mine ? "Your team wins!" : "Good game"));
```

Team score is the sum of its members' scores; `winnerId` is null in team play.

## Fast action (positions many times a second)

```ts
const net = vibecade.room.direct({ relayHz: 8 });  // once per page, match purpose only
net.onMessage((data, from) => applyRemote(from, data));
vibecade.onStart(() => setInterval(() => net.send(myState()), 1000 / 15)); // fast: may drop
net.send({ hit: targetId }, { reliable: true });   // ordered, retransmitted
// when the game view goes away: net.close()
```

Let one client (`vibecade.isHost`) decide shared events (pickups, collisions, the clock) and
broadcast them reliably, so two screens never disagree about who scored.

## Challenge setup screen

Manifest `setup: true`. The host opens the app in the challenge sheet with `purpose: "setup"`.

```ts
const vibecade = await connect();
if (vibecade.purpose === "setup") {
  vibecade.ui.autoResize();                          // the sheet fits your form
  renderForm(vibecade.match.settings, {
    done: (s) => vibecade.setup.submit(s, `${s.rounds} rounds · ${s.theme}`), // ≤ 4 KB, summary ≤ 140
    cancel: () => vibecade.setup.cancel(),
  });
  await vibecade.ready();
} else {
  startGame(vibecade.match.settings);               // every player gets the same settings
}
```

Test with `?vibecade-purpose=setup`: the mock's banner links to a match with the submitted settings.

## Spectators

```ts
if (vibecade.isSpectator) {
  hideControls();
  void vibecade.ui.setStatus("Watching");
}
vibecade.state.onChange((state) => render(state));   // same stream as the players
```

## Crowd-judged entries

Manifest `scoring: "votes"` (optional `votesToWin`, 1–99, default 5). Players submit an entry the
crowd votes on in the Arena.

```ts
const photo = await vibecade.media.upload(file, { alt: "My entry" });
await vibecade.submit({ display: { kind: "image", url: photo.url, alt: "My entry" } });
```

## Secret picks (commit, then reveal)

For simultaneous hidden choices (rock paper scissors, sealed bids): each player sends
`sha256(pick + salt)` first, and only reveals `{ pick, salt }` once every commit has arrived;
everyone verifies the hash before scoring. Full example: `examples/rps/index.html` in the VibeCade repo.

## Stats, leaderboards and achievements

Declare them in the manifest first (MCP: `vibecade_set_progress`), then:

```ts
const totals = await vibecade.stats.report({ best_time: ms, wins: won ? 1 : 0 }); // max/min/sum/last
const board = await vibecade.stats.leaderboard("best_time", { limit: 5 });
if (won && !vibecade.achievements.unlocked.has("first_win")) await vibecade.achievements.unlock("first_win");
```

Typical sets: `wins` (sum), `best_score` (max), `best_time` (min, format ms), `games` (sum).
Achievements for first win, streaks, perfect rounds and milestones; keep the total ≤ 500 XP.

## Standalone app (no matches)

Manifest `kind: "app"`. Opened full screen at `/apps/<slug>/open`; the viewer is signed in.

```ts
const vibecade = await connect({ mock: { purpose: "app" } });
greet(`Hi @${vibecade.user.handle}`);
const notes = (await vibecade.storage.get<string[]>("notes")) ?? [];
await vibecade.storage.set("notes", [text, ...notes]);
await vibecade.stats.report({ notes: notes.length + 1 });
```

No `ready()`/`onStart`/`submit`, room or state. Full example: `examples/notes/index.html`.
