# {{name}}: notes for coding agents

This is a VibeCade game: a web page that VibeCade (the social arcade on X) runs in a frame, talking
to the platform through `vibecade-sdk`. Players, the room, the shared match state, scoring and
results come from the SDK; the listing and capabilities live in `vibecade.manifest.json`.

Tools that know VibeCade:

- MCP server (docs search, manifest checks, stats and achievements, project review):
  `claude mcp add vibecade -- npx -y vibecade-mcp` (any MCP client: `npx -y vibecade-mcp`).
- Claude Code plugin with the VibeCade skill and that server:
  `/plugin marketplace add realxhabib/VibeCade` then `/plugin install vibecade-dev@vibecade`.

Rules that keep a game working on VibeCade:

- Call `ready()` once the first screen is drawn; start play in `onStart`.
- Every seated player calls `submit({ score })` exactly once. In practice the other seats are bots
  (`isBot`): this app plays them and calls `submitFor(bot.id, …)` for each.
- Randomness everyone must agree on comes from the client's seeded `random`, never `Math.random()`.
- Spectators can't send or submit: hide the controls when `isSpectator`.
- Stats and achievements must be declared in the manifest before the code reports them.
- Fit a ~450 × 350 frame and touch screens; no hover, right-click or keyboard-only controls.

Run `npm run dev` and open the page directly: the SDK's mock host seats you against a practice bot
(`?xapps-players=4`, `?xapps-turns=1`, `?xapps-role=spectator`, `?xapps-purpose=setup`).
SDK reference: https://github.com/realxhabib/VibeCade/blob/HEAD/packages/sdk/README.md
