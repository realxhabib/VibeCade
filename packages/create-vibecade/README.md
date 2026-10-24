# create-vibecade

Scaffold a [VibeCade](https://github.com/realxhabib/VibeCade) app in seconds. No dependencies, and no
network needed to scaffold.

```bash
npx create-vibecade my-game                          # React + Vite + TypeScript (default)
npx create-vibecade my-board --template turn-based   # shared state + turns
npx create-vibecade my-page --template vanilla       # one HTML file, no build
```

Then:

```bash
cd my-game
npm install
npm run dev        # opens standalone with the SDK's mock host: you vs a practice bot
```

The whole path, from here to a game people play inside a post on X, is in
[Build your first game](https://github.com/realxhabib/VibeCade/blob/HEAD/docs/build-a-game.md).

## Templates

| Template | What you get |
| --- | --- |
| `react` | Vite + React + TypeScript with `vibecade-sdk`: a 1v1 tap race using room messages, `submit`, and a practice bot via `submitFor` |
| `turn-based` | The React setup with tic-tac-toe on the shared match state (`state.update` + `turn.end`), read-only spectators and a practice bot |
| `vanilla` | A single `index.html` importing the SDK bundle from your VibeCade host (`https://vibecade.si/sdk/v1.js`) |

Every template includes a `vibecade.manifest.json` (your listing and capabilities: name, tagline,
category, icon, accent, modes, players, teams, spectators, turnBased, scoring, how-to…) and a
README with the path to launch: `npm run dev` → register at `https://vibecade.si/developers/new` →
Sandbox → versions → review.

## Options

| Option | |
| --- | --- |
| `-t, --template <name>` | `react` (default), `turn-based` or `vanilla` |
| `-n, --name <title>` | Display name (default: from the folder name, `my-game` → "My Game") |
| `-y, --yes` | No questions, use the defaults |
| `-l, --list` | List the templates |
| `-h, --help` · `-v, --version` | |

Without `--yes`, and when run in a terminal, it asks for anything you left out. The project name
must be a valid npm package name, and the target folder must be empty or not exist.

## Programmatic use

```js
import { scaffold } from "create-vibecade";

scaffold({ targetDir: "./my-game", template: "turn-based", name: "My Game" });
```
