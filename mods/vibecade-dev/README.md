# vibecade-dev

Build VibeCade games with Claude Code. The plugin adds:

- **The `vibecade-game` skill**: the workflow from idea to playable post (scaffold, build, manifest,
  stats and achievements, local testing, hosting, register, review), the rules that make a game work
  on VibeCade (ready/submit, practice bots, the shared seed, spectators, the small frame, framing
  headers), how to pick a multiplayer model, and references for the API, patterns and the manifest.
- **The `vibecade` MCP server** ([`vibecade-mcp`](../../packages/mcp/README.md)): docs search,
  scaffolding, manifest validation, stats and achievements, a project check and test URLs.

## Install

```
/plugin marketplace add realxhabib/VibeCade
/plugin install vibecade-dev@xapps
```

Then ask: *"Build a VibeCade trivia game for up to 6 players."* Claude loads the skill on its own
when the task is about VibeCade or vibecade-sdk.

The MCP server runs with `npx -y vibecade-mcp@latest`, so it needs Node 20+ and the package on npm.
The skill works without it (it falls back to commands and doc links).

## Files

```
.claude-plugin/plugin.json
.mcp.json                                  the vibecade MCP server
skills/vibecade-game/SKILL.md              workflow and rules
skills/vibecade-game/references/api.md     the client API and React hooks
skills/vibecade-game/references/patterns.md
skills/vibecade-game/references/manifest.md
```

The MCP server serves the same skill and references as docs, so agents outside Claude Code get them
too. Edit them here; `npm run build -w vibecade-mcp` copies them.

## Checks

```
claude plugin validate mods/vibecade-dev
```
