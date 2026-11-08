/**
 * "New on VibeCade": the home page spotlight, newest first.
 *
 * To announce something, add an entry at the TOP of SPOTLIGHT and you're
 * done: the first entry is the big card, the next SPOTLIGHT_SHOWN - 1 sit
 * beside it, and older ones simply drop off the home page (keep them here
 * as a changelog, or delete them). Nothing reads the clock, so what shows is
 * exactly what's at the top of this list.
 *
 * - `app`: a catalog slug. The card borrows that app's cover art and colors,
 *   links to its page, and the app gets a "New" badge on its marketplace
 *   card while its entry is shown with kind "game". An app this deployment
 *   doesn't list is skipped.
 * - Without `app`, give `icon` (an emoji), `accent` and `href`.
 */

export type SpotlightKind = "game" | "feature" | "update";

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

/** Slugs of games currently spotlighted as new (for the marketplace's "New" badge). */
export const NEW_APP_SLUGS: ReadonlySet<string> = new Set(
  SPOTLIGHT.slice(0, SPOTLIGHT_SHOWN)
    .filter((e) => e.kind === "game" && e.app)
    .map((e) => e.app as string),
);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-08" → "Nov 8" (no time zone involved, so server and browser agree). */
export function spotlightDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}`.trim();
}

export const SPOTLIGHT_KIND_LABEL: Record<SpotlightKind, string> = {
  game: "Game",
  feature: "Feature",
  update: "Update",
};
