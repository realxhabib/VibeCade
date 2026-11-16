import { describe, expect, it } from "vitest";
import { OFFICIAL_APPS } from "./catalog";
import { NEW_FOR_DAYS, SPOTLIGHT, isNewApp, listedSince, spotlightFeed } from "./spotlight";
import type { AppManifest } from "./types";

const NOW = Date.parse("2026-11-16T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

const app = (slug: string, extra: Partial<AppManifest> = {}): AppManifest => ({
  ...OFFICIAL_APPS[0]!,
  slug,
  name: slug,
  tagline: `${slug} tagline`,
  official: false,
  status: "published",
  createdAt: daysAgo(60),
  ...extra,
});

describe("spotlight", () => {
  it("counts an app as new from when it was published, not registered", () => {
    expect(listedSince(app("a", { publishedAt: daysAgo(1) }))).toBe(daysAgo(1));
    expect(listedSince(app("a", { publishedAt: null }))).toBe(daysAgo(60));
    expect(isNewApp(app("a", { publishedAt: daysAgo(1) }), NOW)).toBe(true);
    expect(isNewApp(app("a", { publishedAt: null, createdAt: daysAgo(2) }), NOW)).toBe(true);
    expect(isNewApp(app("a", { publishedAt: daysAgo(NEW_FOR_DAYS + 1) }), NOW)).toBe(false);
    expect(isNewApp(app("a", { publishedAt: null }), NOW)).toBe(false);
  });

  it("never calls an unlisted app new", () => {
    expect(isNewApp(app("a", { status: "pending", createdAt: daysAgo(1) }), NOW)).toBe(false);
    expect(isNewApp(app("a", { status: "rejected", publishedAt: daysAgo(1) }), NOW)).toBe(false);
    expect(isNewApp(app("a", { retired: true, publishedAt: daysAgo(1) }), NOW)).toBe(false);
  });

  it("adds newly published games to the hand-written entries, newest first", () => {
    const apps = [
      app("old", { publishedAt: daysAgo(30) }),
      app("fresh", { name: "Fresh", publishedAt: daysAgo(1) }),
      app("fresher", { publishedAt: daysAgo(0.1), kind: "app" }),
      app("drafty", { status: "pending", createdAt: daysAgo(0) }),
    ];
    const feed = spotlightFeed(apps, NOW);
    expect(feed.map((e) => e.id).slice(0, 2)).toEqual(["new-fresher", "new-fresh"]);
    expect(feed.find((e) => e.id === "new-fresh")).toMatchObject({ kind: "game", title: "Fresh", body: "fresh tagline", app: "fresh", date: daysAgo(1).slice(0, 10) });
    expect(feed[0]).toMatchObject({ kind: "app", cta: "Open it" });
    expect(feed.some((e) => e.app === "old" || e.app === "drafty")).toBe(false);
    // Every hand-written entry is still there, in its order.
    expect(feed.filter((e) => !e.id.startsWith("new-")).map((e) => e.id)).toEqual(SPOTLIGHT.map((e) => e.id));
    // Newest first throughout.
    const dates = feed.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("leaves a game with a hand-written card alone", () => {
    const written = SPOTLIGHT.find((e) => e.kind === "game" && e.app)!;
    const feed = spotlightFeed([app(written.app!, { publishedAt: daysAgo(1) })], NOW);
    expect(feed.filter((e) => e.app === written.app && e.kind === "game").map((e) => e.id)).toEqual([written.id]);
  });
});
