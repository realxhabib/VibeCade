import { expect, test } from "@playwright/test";

// Playable posts: the share link carries a 480×480 player card, and the player
// (what X frames) lets a guest play the bots without signing in.

test("the share link describes a player card", async ({ page, request }) => {
  const response = await request.get("/x/four-in-a-row");
  expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'self'");
  await page.goto("/x/four-in-a-row");
  // People who open the link get the same player, full screen.
  await expect(page).toHaveURL(/\/x\/play\/four-in-a-row$/);

  const html = await response.text();
  const meta = (name: string) => html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1];
  expect(meta("twitter:card")).toBe("player");
  expect(meta("twitter:player")).toMatch(/^https?:\/\/[^/]+\/x\/play\/four-in-a-row$/);
  expect([meta("twitter:player:width"), meta("twitter:player:height")]).toEqual(["480", "480"]);
  expect(meta("twitter:image")).toMatch(/\/x\/four-in-a-row\/preview\.png$/);
  expect(meta("og:title")).toBe("Play Four in a Row on VibeCade");
  expect(html).not.toContain("twitter:player:stream");

  const preview = await request.get("/x/four-in-a-row/preview.png");
  expect(preview.headers()["content-type"]).toBe("image/png");
});

test("X may frame the player, which runs a guest practice match", async ({ page, request }) => {
  const player = await request.get("/x/play");
  expect(player.headers()["content-security-policy"]).toContain("https://x.com");
  expect(player.headers()["cache-control"]).toContain("no-store");
  expect(player.headers()["x-frame-options"]).toBeUndefined();

  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto("/x/play");
  await page.getByRole("link", { name: /Four in a Row/ }).click();
  // "Play vs bots" for guests; "Bots" next to the challenge buttons where the card plays real matches.
  await page.getByRole("button", { name: /^(Play vs bots|Bots)$/ }).click();
  await expect(page).toHaveURL(/\/x\/play\/match\/m-/);
  await expect(page.frameLocator("iframe").locator("body")).toBeVisible();
  await expect(page.getByText("Offline practice")).toHaveCount(0);
});

test("standalone apps open inside the card, not a new tab", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto("/x/play");
  await page.getByRole("link", { name: /Perfect Circle/ }).click();
  await page.getByRole("link", { name: "Open Perfect Circle" }).click();
  await expect(page).toHaveURL(/\/x\/play\/perfect-circle\/open$/);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // A guest signs in through the card's popup first: apps get a real X identity.
    await expect(page.getByRole("button", { name: "Sign in with X" })).toBeInViewport();
  } else {
    await expect(page.frameLocator("iframe").locator("canvas").first()).toBeVisible();
    await expect(page.locator("iframe")).toBeInViewport({ ratio: 1 });
  }
  await expect(page.getByRole("button", { name: "Full screen" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to Perfect Circle" }).or(page.getByRole("link", { name: "Back" })).click();
  await expect(page).toHaveURL(/\/x\/play\/perfect-circle$/);
});

test("in the card, people post a challenge whose link is a playable post", async ({ page }) => {
  // Demo mode: the card plays real (local) matches without signing in. With Supabase it needs the popup sign-in.
  test.skip(!!process.env.NEXT_PUBLIC_SUPABASE_URL, "demo mode only");
  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto("/x/play/four-in-a-row");
  await page.getByRole("button", { name: /Post a challenge/ }).click();
  await expect(page).toHaveURL(/\/x\/play\/match\//);
  await expect(page.getByText(/\/x\/m\/m-/)).toBeVisible();
  // The post button fits in the 480×480 card.
  await expect(page.getByRole("button", { name: /Post the challenge on X/ })).toBeInViewport();
});

test("games with their own setup screen set up the challenge inside the card", async ({ page }) => {
  test.skip(!!process.env.NEXT_PUBLIC_SUPABASE_URL, "demo mode only");
  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto("/x/play/nova-rally");
  await expect(page.locator("a[target=_blank]")).toHaveCount(0);
  await page.getByRole("button", { name: /Post a challenge/ }).click();
  const setup = page.frameLocator("iframe[title='Nova Rally setup']");
  await expect(setup.getByText("Set up the race")).toBeVisible();
  await setup.getByRole("button", { name: /^Challenge/ }).click();
  await expect(page).toHaveURL(/\/x\/play\/match\//);
});

test("community apps are in the card too", async ({ page }) => {
  // Demo mode lists the showcase's Starship League; with Supabase, the published catalog.
  test.skip(!!process.env.NEXT_PUBLIC_SUPABASE_URL, "demo mode only");
  await page.setViewportSize({ width: 480, height: 480 });
  await page.goto("/x/play");
  await page.getByRole("link", { name: /Starship League/ }).click();
  await expect(page).toHaveURL(/\/x\/play\/starship-league$/);
  await expect(page.locator("a[target=_blank]")).toHaveCount(0);
  await page.getByRole("button", { name: /^(Play vs bots|Bots)$/ }).click();
  await expect(page).toHaveURL(/\/x\/play\/match\//);
  await expect(page.locator("iframe").first()).toHaveAttribute("src", /starshipleague/);
});

test("a posted challenge's link describes a player card for the match", async ({ request }) => {
  const html = await (await request.get("/x/m/some-match")).text();
  expect(html).toMatch(/<meta name="twitter:card" content="player"/);
  expect(html).toMatch(/<meta name="twitter:player" content="https?:\/\/[^/]+\/x\/play\/match\/some-match"/);
});
