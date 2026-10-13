import { describe, expect, it } from "vitest";
import { PLAYER_SIZE, X_FRAME_ANCESTORS, opensInPost, playerCardTags, playsInPost, requestOrigin, xAppPlayerPath, xPlayerPath, xPreviewPath, xSharePath, xSiteHandle } from "./x-player";

const headers = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("x player links", () => {
  it("pairs each share link with its player and preview", () => {
    expect([xSharePath(), xPlayerPath(), xPreviewPath()]).toEqual(["/x", "/x/play", "/x/preview.png"]);
    expect([xSharePath("darts"), xPlayerPath("darts"), xPreviewPath("darts")]).toEqual(["/x/darts", "/x/play/darts", "/x/darts/preview.png"]);
  });

  it("lets X (and only X) frame the player", () => {
    expect(X_FRAME_ANCESTORS.split(" ")).toEqual(["'self'", "https://x.com", "https://*.x.com", "https://twitter.com", "https://*.twitter.com"]);
  });
});

describe("xSiteHandle", () => {
  it("normalizes the handle and ignores junk", () => {
    expect(xSiteHandle("xapps")).toBe("@xapps");
    expect(xSiteHandle(" @XApps_1 ")).toBe("@XApps_1");
    expect(xSiteHandle("")).toBeNull();
    expect(xSiteHandle(undefined)).toBeNull();
    expect(xSiteHandle("not a handle")).toBeNull();
  });
});

describe("requestOrigin", () => {
  it("uses the forwarded host and proto (the domain the link was posted with)", () => {
    expect(requestOrigin(headers({ "x-forwarded-host": "xapps.example, proxy", "x-forwarded-proto": "https", host: "internal:3000" }))).toBe("https://xapps.example");
  });

  it("assumes https except on localhost", () => {
    expect(requestOrigin(headers({ host: "xapps.example" }))).toBe("https://xapps.example");
    expect(requestOrigin(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("falls back to the site URL", () => {
    expect(requestOrigin(headers({}), "https://xapps.example/")).toBe("https://xapps.example");
  });
});

describe("playerCardTags", () => {
  const card = {
    title: "Play VibeCade",
    description: "Games in a post",
    url: "https://xapps.example/x",
    player: "https://xapps.example/x/play",
    image: "https://xapps.example/x/preview.png",
    imageAlt: "VibeCade",
    site: "@xapps",
  };
  const byName = (tags: ReturnType<typeof playerCardTags>) => Object.fromEntries(tags.map((t) => [t.name ?? t.property, t.content]));

  it("describes a 480×480 player card with matching Open Graph tags", () => {
    const tags = byName(playerCardTags(card));
    expect(tags["twitter:card"]).toBe("player");
    expect(tags["twitter:player"]).toBe(card.player);
    expect([tags["twitter:player:width"], tags["twitter:player:height"]]).toEqual([String(PLAYER_SIZE.width), String(PLAYER_SIZE.height)]);
    expect(tags["twitter:image"]).toBe(card.image);
    expect(tags["twitter:site"]).toBe("@xapps");
    expect(tags["og:title"]).toBe(card.title);
    expect(tags["og:image"]).toBe(card.image);
    // A stream is for raw video: X would treat the HTML player as one.
    expect(tags["twitter:player:stream"]).toBeUndefined();
  });

  it("leaves out twitter:site when there's no handle", () => {
    expect(byName(playerCardTags({ ...card, site: null }))["twitter:site"]).toBeUndefined();
  });
});

describe("playsInPost", () => {
  it("runs games with practice in the post and sends everything else to the site", () => {
    expect(playsInPost({ modes: ["live", "practice"] })).toBe(true);
    expect(playsInPost({ kind: "game", modes: ["live"] })).toBe(false);
    expect(playsInPost({ kind: "app", modes: ["live", "practice"] })).toBe(false);
  });

  it("opens standalone apps in the post too", () => {
    expect(opensInPost({ kind: "app", modes: ["live"] })).toBe(true);
    expect(opensInPost({ modes: ["live", "practice"] })).toBe(true);
    expect(opensInPost({ kind: "game", modes: ["live"] })).toBe(false);
    expect(xAppPlayerPath("perfect-circle")).toBe("/x/play/perfect-circle/open");
  });
});
