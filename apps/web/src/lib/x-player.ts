import type { AppManifest } from "@/platform/types";

/**
 * Playable posts: X "player cards". A post linking to a share page (`/x`, or
 * `/x/<slug>` for one app) shows the player (`/x/play…`) inline in the post on
 * desktop web; the mobile apps show the preview image and open the share page.
 * X caches a card's tags (title, image) for about a week; the player itself is
 * live. Add `?v=2` to a link to make X fetch a fresh card.
 */

/** The player's size in the post (X letterboxes the frame to this ratio). */
export const PLAYER_SIZE = { width: 480, height: 480 } as const;

/** The preview still: square like the player, twice its size for sharp screens. */
export const PREVIEW_SIZE = { width: 960, height: 960 } as const;

/** Origins allowed to frame the player (and the app frames inside it). */
export const X_FRAME_ANCESTORS = "'self' https://x.com https://*.x.com https://twitter.com https://*.twitter.com";

/** Apps the player runs in the post: games with practice (guests play the bots). Others open the site. */
export function playsInPost(app: Pick<AppManifest, "kind" | "modes">): boolean {
  return (app.kind ?? "game") === "game" && app.modes.includes("practice");
}

/** Standalone apps (`kind: "app"`) run in the post too, once signed in: `xAppPlayerPath`. */
export function opensInPost(app: Pick<AppManifest, "kind" | "modes">): boolean {
  return playsInPost(app) || app.kind === "app";
}

/** The player's page that runs a standalone app inside the post. */
export function xAppPlayerPath(slug: string): string {
  return `/x/play/${slug}/open`;
}

/** The link to paste into a post. */
export function xSharePath(slug?: string): string {
  return slug ? `/x/${slug}` : "/x";
}

/** The page X frames for that link. */
export function xPlayerPath(slug?: string): string {
  return slug ? `/x/play/${slug}` : "/x/play";
}

/** A match's playable link (an open challenge posted on X) and the player X frames for it. */
export function xMatchSharePath(matchId: string): string {
  return `/x/m/${encodeURIComponent(matchId)}`;
}

export function xMatchPlayerPath(matchId: string): string {
  return `/x/play/match/${encodeURIComponent(matchId)}`;
}

export function xPreviewPath(slug?: string): string {
  return slug ? `/x/${slug}/preview.png` : "/x/preview.png";
}

/** `@handle` for `twitter:site`, from NEXT_PUBLIC_X_HANDLE (with or without the @). Null when unset. */
export function xSiteHandle(raw = process.env.NEXT_PUBLIC_X_HANDLE): string | null {
  const handle = (raw ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? `@${handle}` : null;
}

/** The public origin a request came in on (the domain the link was posted with). */
export function requestOrigin(headers: { get(name: string): string | null }, fallback = process.env.NEXT_PUBLIC_SITE_URL): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim();
  if (host) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
    const proto = (headers.get("x-forwarded-proto") ?? "").split(",")[0]!.trim() || (local ? "http" : "https");
    return `${proto}://${host}`;
  }
  return (fallback || "http://localhost:3000").replace(/\/+$/, "");
}

export interface PlayerCard {
  title: string;
  description: string;
  /** Absolute URLs. */
  url: string;
  player: string;
  image: string;
  imageAlt: string;
  site: string | null;
}

/** The meta tags X and other unfurlers read for a player card, in order. */
export function playerCardTags(card: PlayerCard): { property?: string; name?: string; content: string }[] {
  const tags: { property?: string; name?: string; content: string }[] = [
    { name: "twitter:card", content: "player" },
    { name: "twitter:title", content: card.title },
    { name: "twitter:description", content: card.description },
    { name: "twitter:player", content: card.player },
    { name: "twitter:player:width", content: String(PLAYER_SIZE.width) },
    { name: "twitter:player:height", content: String(PLAYER_SIZE.height) },
    { name: "twitter:image", content: card.image },
    { name: "twitter:image:alt", content: card.imageAlt },
  ];
  if (card.site) tags.push({ name: "twitter:site", content: card.site });
  tags.push(
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "VibeCade" },
    { property: "og:title", content: card.title },
    { property: "og:description", content: card.description },
    { property: "og:url", content: card.url },
    { property: "og:image", content: card.image },
    { property: "og:image:width", content: String(PREVIEW_SIZE.width) },
    { property: "og:image:height", content: String(PREVIEW_SIZE.height) },
    { property: "og:image:alt", content: card.imageAlt },
  );
  return tags;
}
