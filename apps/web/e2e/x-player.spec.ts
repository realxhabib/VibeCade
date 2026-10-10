import { expect, test } from "@playwright/test";

// Playable posts: the share link carries a 480×480 player card, and the player
// (what X frames) lets a guest play the bots without signing in.

test("the share link describes a player card", async ({ page, request }) => {
  const response = await request.get("/x/four-in-a-row");
  expect(response.headers()["content-security-policy"]).toBe("frame-ancestors 'self'");
  await page.goto("/x/four-in-a-row");
  // People who open the link go on to the app's page.
  await expect(page).toHaveURL(/\/apps\/four-in-a-row$/);

  const html = await response.text();
  const meta = (name: string) => html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1];
  expect(meta("twitter:card")).toBe("player");
  expect(meta("twitter:player")).toMatch(/^https?:\/\/[^/]+\/x\/play\/four-in-a-row$/);
  expect([meta("twitter:player:width"), meta("twitter:player:height")]).toEqual(["480", "480"]);
  expect(meta("twitter:image")).toMatch(/\/x\/four-in-a-row\/preview\.png$/);
  expect(meta("og:title")).toBe("Play Four in a Row on XApps");
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
  await page.getByRole("button", { name: /Play vs bots/ }).click();
  await expect(page).toHaveURL(/\/x\/play\/match\/m-/);
  await expect(page.frameLocator("iframe").locator("body")).toBeVisible();
  await expect(page.getByText("Offline practice")).toHaveCount(0);
});
