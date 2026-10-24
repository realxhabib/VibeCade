# Build your first VibeCade game

This guide takes you from an empty folder to a game people play inside a post on X. A VibeCade
game is a web page: VibeCade loads it in a frame and gives it the players (signed in with X), a
live room to talk through, matchmaking, scores and results. The SDK, [`vibecade-sdk`](../packages/sdk/README.md),
is the bridge between the two.

The steps, in short:

1. [Create the project](#1-create-the-project) with `npm create vibecade`
2. [Play it on your computer](#2-play-it-on-your-computer) against a practice bot
3. [Make it your game](#3-make-it-your-game)
4. [Host it](#4-host-it) on any HTTPS host, and allow framing
5. [Try it in the Sandbox](#5-try-it-in-the-sandbox)
6. [Register it](#6-register-it) on VibeCade
7. [Review and publish](#7-review-and-publish)
8. [Share it on X](#8-share-it-on-x) as a playable post
9. [Ship updates](#9-ship-updates)

**Building with an AI agent?** Give it the VibeCade MCP server (`claude mcp add vibecade -- npx -y vibecade-mcp`,
or `npx -y vibecade-mcp` in any MCP client) or, in Claude Code, the `vibecade-dev` plugin
(`/plugin marketplace add realxhabib/VibeCade`, then `/plugin install vibecade-dev@vibecade`). It can
scaffold the project, search these docs, write and validate your manifest, declare stats and
achievements, and check the project for the mistakes in [When something's wrong](#when-somethings-wrong).
Every starter also has an `AGENTS.md` with the rules.

**What you need:** [Node.js](https://nodejs.org) 22 or 24 (the LTS download), an X account to sign
in to VibeCade with, and somewhere to host a static site over HTTPS (Vercel, Netlify, Cloudflare
Pages and GitHub Pages all work and have free plans).

## 1. Create the project

```bash
npm create vibecade@latest my-game
cd my-game
npm install
```

It asks which starter you want (or pass `--template <name>`):

| Starter | What you get |
| --- | --- |
| `react` (default) | Vite + React + TypeScript: a 1v1 tap race with live room messages and a practice bot |
| `turn-based` | The same setup with tic-tac-toe on the shared match state: turns, spectators, a practice bot |
| `vanilla` | One `index.html` that loads the SDK from VibeCade, no build step |

Every starter has a `README.md` and a `vibecade.manifest.json`: your listing (name, tagline,
category, icon, colors) and what the game supports (modes, players, teams, scoring…). You copy
these fields into VibeCade when you register.

## 2. Play it on your computer

```bash
npm run dev
```

Open the address it prints. Outside VibeCade, the SDK starts a **mock host**: you're signed in as
a test player against a practice bot, and the game plays exactly as it would on VibeCade. The
browser console shows what the host sees (`[xapps mock]` lines) and your logs.

Add these to the address to try other tables:

| Add | To get |
| --- | --- |
| `?xapps-players=4` | You and 3 bots |
| `?xapps-teams=2` | Team play |
| `?xapps-turns=1` | Turn-based, seat 0 first |
| `?xapps-role=spectator` | Watching a table of bots |
| `?xapps-purpose=setup` | Your challenge setup screen, if you have one |

More in [Testing multiplayer locally](../packages/sdk/README.md#testing-multiplayer-locally).

## 3. Make it your game

The starter is a working game; change it into yours. Every match goes through the same steps:

1. **Load**: VibeCade opens your page in a frame. `connect()` (or `<VibeCadeProvider>` in React)
   gets the players, a shared random seed and the mode.
2. **`ready()`**: call it once your game is on screen. VibeCade shows the versus intro and a
   countdown. Until you call it, players see a loading screen.
3. **`onStart`**: the match is on. Send moves to the others with `room.send`, and receive theirs
   (`useRoomEvent` in React), or keep the whole game in the shared match state with turns
   (`state.update`, `turn.end`).
4. **`submit()`**: send your score. VibeCade decides the winner, awards XP, updates the
   leaderboards and shows the results screen with rematch and share buttons.

Things that make a game work well on VibeCade:

- **Support practice.** Put `"practice"` in your modes and play the bots yourself (the starters
  show how with `submitFor`). People who see your game in a post play the bots without signing in,
  so a game without practice can only be played by people who sign in.
- **Fit a small frame.** Inside a post on a computer the game gets roughly 450 × 350 pixels; on
  phones it's full screen. Make the layout fit and scroll if it must, and keep buttons big.
- **Touch first.** Many players are on phones: no hover, no right-click, no keyboard required.
- **Use the seed** (`random`) for anything every player must agree on, like a shuffled deck or a
  track layout, so all screens match.

Everything else (2–8 players, teams, spectators, turns over days, a challenge setup screen,
stats, achievements, uploads, and a server that referees matches) is in the
[SDK guide](../packages/sdk/README.md).

## 4. Host it

Build it and put the result on any static host with HTTPS:

```bash
npm run build      # the react and turn-based starters: the site is in dist/
```

The `vanilla` starter has no build: upload the folder as it is.

**Allow VibeCade, and X, to frame your game.** In a post on X, the post frames VibeCade's player
card, and the card frames your game. Browsers check `frame-ancestors` against every one of those
pages, so if your game only allows VibeCade, it works on the website but shows blank inside X.
Either send no `frame-ancestors` and no `X-Frame-Options` header at all (the simplest), or list
VibeCade and X:

```
Content-Security-Policy: frame-ancestors https://vibecade.si https://x.com https://*.x.com https://twitter.com https://*.twitter.com
```

On **Vercel**, add a `vercel.json` next to your `package.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors https://vibecade.si https://x.com https://*.x.com https://twitter.com https://*.twitter.com"
        }
      ]
    }
  ]
}
```

On **Netlify** and **Cloudflare Pages**, put the same thing in a `_headers` file in the folder you
publish (`public/_headers` in the Vite starters, so it lands in `dist/`):

```
/*
  Content-Security-Policy: frame-ancestors https://vibecade.si https://x.com https://*.x.com https://twitter.com https://*.twitter.com
```

**GitHub Pages** doesn't send framing headers, so it works as it is.

## 5. Try it in the Sandbox

Open **https://vibecade.si/developers/sandbox**, paste your game's address and press **Launch**. The
Sandbox runs two seats side by side on one screen, relays their room messages, and shows every
message between your game and VibeCade in a log. Play a few rounds until the log has no errors.

## 6. Register it

1. Go to **https://vibecade.si/developers/new** and sign in with X.
2. Fill in the form from your `vibecade.manifest.json`: name, tagline, description, category, icon
   (an emoji or an image), colors, modes, players, scoring and how to play. Set **App URL** to
   your hosted address. A preview shows how your listing will look.
3. Press **Submit app**. This creates version 1.0.0 and your game's console at
   `https://vibecade.si/developers/apps/<your-game>`.

Your game's address on VibeCade (its slug) comes from its name: "Tap Race" becomes `tap-race`.

While it's in review you can already play it in practice and test both seats in the Sandbox.
In the console you can invite **testers**, who can play builds that aren't live yet, and see your
game's **Analytics** and **Logs** (everything your game sends with `log`).

## 7. Review and publish

Every new game, and every new version, is reviewed by VibeCade before players get it. Your
console shows where each version is (in review, approved, live). Once a version is approved,
**Publish** it from the Versions tab: it's listed on the site for everyone, and its playable post
works (next step).

## 8. Share it on X

Post your game's share link on X:

```
https://vibecade.si/x/<your-game>
```

X shows it as a **playable post**: people play your game right inside the post. Signed out, they
play the bots (your practice mode). Signed in (with one tap, inside the post), they can post a
challenge, quick-match or challenge a friend by their @handle, and the challenge they post is a
playable post too. On the X phone apps the same link opens your game full screen.

`https://vibecade.si/x` shares the whole arcade. X remembers a link's card for about a week, so
after you change your listing, share the link with something new on the end, like `?v=2`.

## 9. Ship updates

Players keep the version that's live until you publish a new one:

1. Deploy your changes to a new address (or the same one, if you're only changing the manifest).
2. In your game's console, open **Versions** → **New version**, pick patch, minor or major, change
   what's new (the URL, the listing, the manifest) and write what changed.
3. **Save & submit for review**. Once it's approved, **Publish** it and players get it. Your
   testers can play the new build before then.

## When something's wrong

| What you see | Why, and the fix |
| --- | --- |
| The game is blank inside a post on X, but works on the website | Your host's `frame-ancestors` doesn't include X. See [Host it](#4-host-it). |
| The game is blank everywhere | Your host blocks framing (`X-Frame-Options`, or `frame-ancestors` without VibeCade), or the URL isn't HTTPS. |
| It stays on the loading screen | Your game never called `ready()`. Call it once you've drawn your first screen (setup screens too). |
| Signed-out people in a post can't play | Add `"practice"` to your modes and play the bots yourself. |
| "Not running inside VibeCade" | You opened it some other way than the mock (for example inside another site's frame). Open it directly, or in the Sandbox. |
| Players see different things | Use the shared seed (`random`) for anything random, and send moves through the room or the shared state. |

Questions or problems with the SDK: [open an issue](https://github.com/realxhabib/VibeCade/issues).
