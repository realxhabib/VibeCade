# vibecade-mcp

An [MCP](https://modelcontextprotocol.io) server for building [VibeCade](https://github.com/realxhabib/VibeCade)
games with an AI agent. It gives Claude Code, Claude Desktop, Cursor or any MCP client the
`vibecade-sdk` docs, the project starters, and the same manifest checks VibeCade runs when you
register, so the agent can go from an idea to a game that's ready to ship.

No API keys, no network: everything runs locally over stdio.

## Install

```bash
claude mcp add vibecade -- npx -y vibecade-mcp           # Claude Code
```

Other clients take the same command:

```json
{ "mcpServers": { "vibecade": { "command": "npx", "args": ["-y", "vibecade-mcp"] } } }
```

In Claude Code you can also install the **`vibecade-dev` plugin**, which bundles this server with a
skill that teaches the agent the VibeCade workflow and rules:

```
/plugin marketplace add realxhabib/VibeCade
/plugin install vibecade-dev@vibecade
```

Then ask for a game: *"Make a VibeCade air hockey game for 2 players with a practice bot."*

## Tools

| Tool | What it does |
| --- | --- |
| `vibecade_search_docs` | Searches the SDK reference, the build-a-game guide, the patterns and the manifest reference; returns section ids |
| `vibecade_read_doc` | Lists the docs, shows a doc's contents, or reads one section (`sdk#stats--leaderboards`) |
| `vibecade_create_app` | Scaffolds a project from the `react`, `turn-based` or `vanilla` starter (what `npm create vibecade` does) |
| `vibecade_validate_manifest` | Checks `vibecade.manifest.json` with VibeCade's own rules and lists every problem at once, plus warnings (no practice mode, placeholder URL…) |
| `vibecade_set_progress` | Declares stats (leaderboards) and achievements in the manifest from short JSON, validated like the console's import; returns the JSON to paste into the console |
| `vibecade_check_app` | Reviews a project folder: manifest, `ready`/`submit`/`submitFor`, stats and achievements used but not declared, capabilities the code uses but the manifest doesn't switch on, `Math.random` in multiplayer code, reserved events, and framing headers that blank the game inside X |
| `vibecade_test_url` | Builds a local test address for the SDK's mock host: N players, teams, turns, spectating, the setup screen, settings, and the manifest's stats and achievements |

Resources: every doc as `vibecade://docs/<id>` (`skill`, `api`, `patterns`, `manifest`, `sdk`,
`guide`, `templates`). Prompt: `build-vibecade-game` (with an optional `idea`).

Relative paths in tool arguments resolve against the server's working directory, which is your
project folder when the client starts it there.

## Develop

The server is TypeScript with no runtime dependencies besides `create-vibecade` (for the
templates). The manifest validators and the app scanner are bundled from the VibeCade web app's
source (`apps/web/src/platform`), so they never drift from what the site accepts.

```bash
npm run build -w vibecade-mcp     # dist/vibecade-mcp.js + dist/docs
npm test -w vibecade-mcp
claude mcp add vibecade-dev -- node "$PWD/packages/mcp/dist/vibecade-mcp.js"   # try your build
```

The docs it serves are copied at build time from `packages/sdk/README.md`, `docs/build-a-game.md`,
`packages/create-vibecade/README.md` and the skill in `mods/vibecade-dev/skills/vibecade-game/`.
Publish it together with `vibecade-sdk` and `create-vibecade` (same version).
