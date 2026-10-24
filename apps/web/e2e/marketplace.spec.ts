import { expect, test } from "@playwright/test";
import { signIn, enableDemo } from "./helpers";

test("home shows the hero and featured apps", async ({ page }) => {
  await enableDemo(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Challenge");
  await expect(page.getByRole("link", { name: /Four in a Row/ }).first()).toBeVisible();
});

test("marketplace filters by category", async ({ page }) => {
  await enableDemo(page);
  await page.goto("/apps");
  // Only categories that have apps get a tab.
  await expect(page.getByRole("tab", { name: /Contests/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /Games/ }).click();
  await expect(page.getByRole("link", { name: /Four in a Row/ }).first()).toBeVisible();
});

test("a persona accepts a challenge and the match starts", async ({ page }) => {
  await signIn(page, "challenger_e2e");
  await page.goto("/apps/rps-showdown");
  await page.getByRole("button", { name: "Challenge someone" }).click();
  await page.getByLabel("Search players by handle").fill("pixel");
  await page.getByRole("button", { name: /@pixelqueen/ }).click();
  await page.getByRole("button", { name: "Challenge @pixelqueen" }).click();
  await expect(page).toHaveURL(/\/play\//);
  // The persona accepts within a few seconds, then the app loads on stage.
  await expect(page.frameLocator("iframe").getByRole("button", { name: "Rock" })).toBeVisible({ timeout: 20_000 });
});
