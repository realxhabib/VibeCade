# VibeCade for iPhone

A native SwiftUI app for VibeCade (bundle `com.meemr.vibecade`, team UP938HBR8N).

- **Games** is native: featured games, search, every first-party game with how-to-play and achievements.
  The list comes from `apps/web/src/platform/catalog.ts`; refresh it after catalog changes with
  `npm ci && node ios/scripts/export-catalog.mjs` from the repo root (writes `VibeCade/Resources/`).
- **Play**, **Challenges**, **Arena** and **Ranks** are vibecade.si in a web view, so matches, XP and
  sign-in (Sign in with X) are the site's own. All tabs share one cookie store. The app hides the site's
  bottom dock, which its own tab bar replaces; the match's full-screen toggle is the site's own.
- In a match (`/play/<id>`, `/apps/<slug>/open`) the tab bar and status bar hide and the game goes edge to edge.
  The tab bar is the app's own (not TabView's), so it hides on every screen size, the Duo's inner screen included.
- **iPhone Duo**: half folded during a match, the game takes the top half (left half sideways) and the
  other half shows the game's controls: how to play, Leave, Reload and Whole screen. Unfolded, the shelf and
  game pages use wider layouts. `-forceHalfOpen YES` fakes the fold in the Simulator.
- Links off the site open in Safari; "post to X" links open the X app.

Build: `cd ios && xcodegen && xcodebuild -scheme VibeCade -destination 'platform=iOS Simulator,name=iPhone 17' test`.
