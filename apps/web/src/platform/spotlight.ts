import type { AppManifest } from "./types";

/**
 * "New on VibeCade": the home page spotlight, newest first.
 *
 * New games announce themselves: any listed game or app that went public in
 * the last NEW_FOR_DAYS days (a community app once review approves it, a
 * catalog app from its `createdAt`) gets a card made from its name, tagline
 * and art, and a "New" badge on its marketplace card. See `spotlightFeed`.
 *
 * To announce anything else (a feature, an update, or a hand-written card for
 * a game), add an entry at the TOP of SPOTLIGHT. The feed is both lists merged
 * by date, newest first: the first is the big card, the next
 * SPOTLIGHT_SHOWN - 1 sit beside it, and older ones drop off the home page
 * (keep them here as a changelog, or delete them).
 *
 * - `app`: a catalog slug. The card borrows that app's cover art and colors,
 *   links to its page, and the app gets a "New" badge on its marketplace
 *   card while its entry is shown with kind "game". An app this deployment
 *   doesn't list is skipped.
 * - Without `app`, give `icon` (an emoji), `accent` and `href`.
 */

export type SpotlightKind = "game" | "app" | "feature" | "update";

export interface SpotlightEntry {
  id: string;
  /** YYYY-MM-DD, shown as "Nov 8". */
  date: string;
  kind: SpotlightKind;
  title: string;
  body: string;
  app?: string;
  icon?: string;
  accent?: [string, string];
  href?: string;
  cta?: string;
}

/** How many entries the home page shows (one big card plus the rest). */
export const SPOTLIGHT_SHOWN = 4;

export const SPOTLIGHT: SpotlightEntry[] = [
  {
    id: "online-now",
    date: "2026-11-08",
    kind: "feature",
    title: "See who's online",
    body: "The top bar shows who's around and what they're up to. Invite them straight from your lobby, or jump in when someone's waiting for a rival.",
    icon: "👥",
    accent: ["#3ddc97", "#2f8cff"],
    href: "/apps",
    cta: "Find a game",
  },
  {
    id: "voice-chat",
    date: "2026-11-08",
    kind: "feature",
    title: "Voice chat in live matches",
    body: "Hop on the mic in the lobby and in live matches. Mute anyone just for yourself, and spectators can listen in.",
    icon: "🎙️",
    accent: ["#a78bfa", "#ff5d8f"],
    href: "/apps/frontline",
    cta: "Try it in Frontline",
  },
  {
    id: "frontline-seasons",
    date: "2026-11-02",
    kind: "update",
    title: "Frontline gets seasons",
    body: "Snowfall, autumn leaves and spring blossom come to the port. Hosts can now set time and kill limits, and the kill leader wears a crown.",
    app: "frontline",
    cta: "Play Frontline",
  },
  {
    id: "nova-rally",
    date: "2026-10-12",
    kind: "game",
    title: "Nova Rally",
    body: "Kart racing with rocket ships across Mars, the asteroid belt and beyond.",
    app: "nova-rally",
    cta: "Start your engines",
  },
];

/** How long a newly published game or app counts as new. */
export const NEW_FOR_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When the app went public: its first approval, else when it was added. */
export function listedSince(app: Pick<AppManifest, "publishedAt" | "createdAt">): string {
  return app.publishedAt || app.createdAt;
}

/** Slugs given a hand-written game card that's on the home page (badged regardless of age). */
const HAND_PICKED_GAMES: ReadonlySet<string> = new Set(
  SPOTLIGHT.slice(0, SPOTLIGHT_SHOWN)
    .filter((e) => (e.kind === "game" || e.kind === "app") && e.app)
    .map((e) => e.app as string),
);

/** Listed and went public within NEW_FOR_DAYS of `now` (for the marketplace's "New" badge too). */
export function isNewApp(app: AppManifest, now: number): boolean {
  if (HAND_PICKED_GAMES.has(app.slug)) return true;
  if (app.status !== "published" || app.retired) return false;
  const since = Date.parse(listedSince(app));
  return Number.isFinite(since) && since <= now + DAY_MS && now - since < NEW_FOR_DAYS * DAY_MS;
}

/** The card a newly published game gets on its own. */
function autoEntry(app: AppManifest): SpotlightEntry {
  const isApp = app.kind === "app";
  return {
    id: `new-${app.slug}`,
    date: listedSince(app).slice(0, 10),
    kind: isApp ? "app" : "game",
    title: app.name,
    body: app.tagline || app.description,
    app: app.slug,
    cta: isApp ? "Open it" : "Play now",
  };
}

/**
 * The spotlight: SPOTLIGHT plus a card for each newly published game that
 * doesn't already have a hand-written one, newest first (on the same day a
 * game comes before a feature). Not cut to SPOTLIGHT_SHOWN.
 */
export function spotlightFeed(apps: readonly AppManifest[], now: number): SpotlightEntry[] {
  const written = new Set(SPOTLIGHT.filter((e) => e.app && (e.kind === "game" || e.kind === "app")).map((e) => e.app));
  const fresh = apps
    .filter((a) => !written.has(a.slug) && isNewApp(a, now))
    // The latest publish first, also within a day.
    .sort((a, b) => listedSince(b).localeCompare(listedSince(a)))
    .map(autoEntry);
  // Stable sort: hand-written entries keep their order, new games lead their day.
  return [...fresh, ...SPOTLIGHT].sort((a, b) => b.date.localeCompare(a.date));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-08" → "Nov 8" (no time zone involved, so server and browser agree). */
export function spotlightDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`.trim();
}

export const SPOTLIGHT_KIND_LABEL: Record<SpotlightKind, string> = {
  game: "Game",
  app: "App",
  feature: "Feature",
  update: "Update",
};
