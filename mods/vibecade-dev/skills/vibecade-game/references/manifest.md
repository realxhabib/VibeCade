# vibecade.manifest.json

The manifest sits in the project root. It holds the listing people see and what the game
supports. The developer copies it into VibeCade when registering (the registration form can scan
the project and fill itself in from this file), and each new version in the console carries its
own copy. Check it with the MCP tool `vibecade_validate_manifest`.

```json
{
  "name": "Tap Race",
  "version": "1.0.0",
  "url": "https://tap-race.example.com/",
  "tagline": "Most taps in 10 seconds wins.",
  "description": "A 10-second tap race against friends, strangers or a practice bot.",
  "category": "games",
  "kind": "game",
  "icon": "👆",
  "accent": ["#8b5cf6", "#22d3ee"],
  "modes": ["live", "practice"],
  "players": { "min": 2, "max": 2 },
  "teams": 0,
  "spectators": true,
  "setup": false,
  "turnBased": false,
  "scoring": "high",
  "howTo": ["Wait for the countdown.", "Tap as fast as you can.", "Most taps wins."],
  "stats": [{ "key": "best_taps", "label": "Best taps", "aggregate": "max" }],
  "achievements": [{ "id": "first_win", "name": "First win", "description": "Win a race", "icon": "🏁", "xp": 20 }]
}
```

## Fields

| Field | Rule | Notes |
| --- | --- | --- |
| `name` | 2–40 characters, required | The slug comes from it: "Tap Race" → `tap-race` |
| `tagline` | 1–90 characters, required | One line on cards |
| `description` | ≤ 1,200 characters | The app page text |
| `category` | `games`, `contests`, `debates`, `trivia`, `creative`, `social`, `news`, `tools` or `finance`, required | |
| `kind` | `game` (default) or `app` | `app`: a standalone app with no matches |
| `icon` | One emoji, required | An uploaded image can replace it in the console |
| `accent` | Two hex colors, required | Card gradient |
| `modes` | One or more of `live`, `async` (play anytime), `practice`, required | Always include `practice` for games |
| `players` | `{ min, max }`, 2 ≤ min ≤ max ≤ 8 | Default `{ "min": 2, "max": 2 }` |
| `teams` | 0 (free for all) or 2–4 | `players.max` must be a multiple of it |
| `spectators` | boolean, default true | Others can watch live matches |
| `setup` | boolean, default false | The app renders its own challenge setup (`purpose: "setup"`) |
| `turnBased` | boolean, default false | Host turn UI and "your turn" inbox items |
| `scoring` | `high`, `low` or `votes`, required | `votes`: the Arena crowd judges entries |
| `votesToWin` | integer 1–99, default 5 | Only with `scoring: "votes"` |
| `howTo` | ≤ 3 lines of ≤ 120 characters | Shown before a match |
| `stats` | ≤ 8, see below | Leaderboard tabs on the app page |
| `achievements` | ≤ 30, ≤ 500 XP in total, see below | |
| `url` | `https://…` (or `http://localhost` while testing) | Where the game is hosted; set per version |
| `version` | `1.2.3` | The first registration is 1.0.0; later ones are new versions in the console |

Server authority (`authority: "server"`, your server settles matches) is switched on in the app's
Server panel on VibeCade, not by the manifest.

## Stats

`{ "key": "best_time", "label": "Best time", "aggregate": "min", "format": "ms" }`

- `key`: `^[a-z][a-z0-9_]{0,31}$`, unique. `label`: 1–40 characters.
- `aggregate`: `max` (best score), `min` (best time, ranks ascending), `sum` (running total), `last`.
- `format`: `number` (default), `ms` or `percent`.

## Achievements

`{ "id": "first_win", "name": "First win", "description": "Win a match", "icon": "🏆", "xp": 20, "secret": false }`

- `id`: same pattern as stat keys, unique. `name`: 1–40 characters. `description`: ≤ 140.
- `icon`: exactly one emoji. `xp`: whole number 0–100; all achievements together ≤ 500 XP.
- `secret: true` hides it on profiles until unlocked. XP is awarded once.

Short forms are fine with `vibecade_set_progress` or the console's "Stats & achievements as JSON"
import: a stat with only a `label` gets a key from it and `aggregate: "max"`; an achievement with
only a `name` gets an id, the 🏆 icon and 0 XP.
